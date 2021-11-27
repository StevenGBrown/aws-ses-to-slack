'use strict'

const AWS = require('aws-sdk')
const axios = require('axios')
const FormData = require('form-data')
const simpleParser = require('mailparser').simpleParser

const s3 = new AWS.S3({ apiVersion: '2006-03-01' })

const MAX_SECTION_TEXT_LENGTH = 3000 // https://api.slack.com/reference/block-kit/blocks#section_block

exports.handler = async (event) => {
  // S3 bucket containing the emails received by SES
  const s3Bucket = getEnv('S3_BUCKET')

  // "Bot User OAuth Access Token" from "OAuth & Permissions" tab for the bot
  const token = getEnv('SLACK_TOKEN')

  console.log(JSON.stringify(event, null, 2))

  for (const record of event.Records) {
    const sesNotification = record.ses

    checkForDodgyEmail({ sesNotification })

    const emailBuffer = await getEmailFromS3({ s3Bucket, sesNotification })
    const mail = await parseEmail(emailBuffer)

    for (const recipient of sesNotification.receipt.recipients) {
      const match = recipient.match(/^(.+?)@.+/)
      if (!match) {
        console.log(`Ignoring ${recipient}`)
        continue
      }
      const channel = match[1]

      const response = await postMessageToSlack({
        channel,
        mail,
        sesNotification,
        token,
      })

      if (response.ts && mail.attachments) {
        for (const attachment of mail.attachments) {
          console.log({ attachment })
          await postFileToSlack({
            channel,
            thread_ts: response.ts,
            attachment,
            token,
          })
        }
      }
    }
  }
}

function getEnv(name) {
  const envVar = process.env[name]
  if (!envVar) {
    throw new Error(`Environment variable ${name} not configured`)
  }
  return envVar
}

const allowedVerdicts = ['dkimVerdict', 'dmarcVerdict']

function checkForDodgyEmail({ sesNotification }) {
  const failingVerdicts = []
  const { receipt } = sesNotification
  for (const property in receipt) {
    if (
      property.endsWith('Verdict') &&
      !allowedVerdicts.includes(property) &&
      receipt[property] &&
      receipt[property].status !== 'PASS' &&
      receipt[property].status !== 'DISABLED'
    ) {
      failingVerdicts.push(property)
    }
  }
  if (failingVerdicts.length) {
    throw new Error(`Email rejected due to ${failingVerdicts}`)
  }
}

async function getEmailFromS3({ s3Bucket, sesNotification }) {
  const params = {
    Bucket: s3Bucket,
    Key: sesNotification.mail.messageId,
  }
  console.log('Get from S3', params)
  try {
    const result = await s3.getObject(params).promise()
    return result.Body
  } catch (e) {
    console.error('S3 Error')
    throw e
  }
}

async function parseEmail(emailBuffer) {
  try {
    return simpleParser(emailBuffer)
  } catch (e) {
    console.error('Error parsing email message')
    throw e
  }
}

async function postMessageToSlack({ channel, mail, sesNotification, token }) {
  const { from, replyTo, subject } = sesNotification.mail.commonHeaders

  const { text, blocks } = prepareSlackMessage({
    from,
    replyTo,
    subject,
    mailText: mail.text,
  })

  // https://api.slack.com/methods/chat.postMessage
  console.log('chat.postmessage', { channel, subject })
  const response = await axios.post(
    'https://slack.com/api/chat.postMessage',
    { channel, text, blocks },
    {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  )
  return response.data
}

function prepareSlackMessage({ from, replyTo, subject, mailText }) {
  if (replyTo && replyTo.length) {
    from = replyTo
  }

  const emailRegexp = /<(.+?@.+?)>/g

  const notification =
    'Email from ' +
    from[0].replace(emailRegexp, '').trim() +
    ': ' +
    subject.trim()

  const messageHeader = [
    ...from.map((f) => '*From*: ' + f.replace(emailRegexp, '<mailto:$1|$1>')),
    '*Subject*: ' + subject,
  ]
    .join('\n')
    .substring(0, MAX_SECTION_TEXT_LENGTH)

  const messageContent =
    mailText
      .replace(emailRegexp, '<mailto:$1|$1>')
      .trim()
      .replace(/\n{2,}/g, '\n\n')
      .substring(0, MAX_SECTION_TEXT_LENGTH) || '_(end of message)_'

  return {
    text: notification,
    blocks: [
      markdownSection(messageHeader),
      { type: 'divider' },
      markdownSection(messageContent),
    ],
  }
}

function markdownSection(text) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: escape(text) },
  }
}

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function postFileToSlack({ channel, thread_ts, attachment, token }) {
  const filename = attachment.filename || 'untitled'

  const form = new FormData()
  form.append('channels', channel)
  form.append('thread_ts', thread_ts)
  form.append('title', filename)
  form.append('file', attachment.content, { filename })

  // https://api.slack.com/methods/files.upload
  console.log('files.upload', {
    channel,
    thread_ts,
    filename,
    size: attachment.size,
  })
  await axios.post('https://slack.com/api/files.upload', form, {
    headers: {
      ...form.getHeaders(),
      Authorization: 'Bearer ' + token,
    },
  })
}

# aws-ses-to-slack

This forwards emails sent to `<channel>@<your-domain>` to that channel in Slack.

I recommend using a subdomain for this, e.g. `slack.example.com`.

## Requirements

- AWS account and credentials
- Permission to add bots to the Slack workspace
- Node 22
- npm 7

## First time setup

Instructions for installing in a new Slack workspace or AWS account.

### Slack Bot

- Go to https://api.slack.com/apps and create a new app.
- Fill in `Basic Information` -> `Display Information`.  
  Suggestions:
  - App name: `EmailBot`
  - Short description: `Send emails to slack - <channel>@<your-domain>`
  - App icon: https://pixabay.com/vectors/animal-anthropomorphized-bird-1320792/
  - Background color: `#2c2d30`
- Go to `Bot Users` and add a bot.  
  Suggestions:
  - Display name: `EmailBot`
  - Default username: `emailbot`
- Go to `OAuth & Permissions` and add `chat:write` to the Bot Token Scopes.
- Open Slack and add the app.

### AWS

- Open the AWS console.
- Create a new Node 22 lambda and deploy the code to it (see How to Deploy).
- SES
  - On the `Identity Management` -> `Domains` tab, add your domain and wait a few minutes for verification.
  - On the `Email Receiving` -> `Rule Sets` tab, select `Create a New Rule Set` then `Create Rule`.
    - Recipient: Your domain.
    - Action 1: S3 with a new bucket.
    - Action 2: Lambda with the lambda created earlier and for the `Invocation Type` select `Event`.
- Configure the bucket in S3
  - On the `Permissions` tab, block all public access.
  - On the `Management` tab, add a lifecycle rule to `Expire current version of object` after a week.
- Configure the lambda
  - Give it `"s3:GetObject"` permission for your S3 bucket (e.g. `"arn:aws:s3:::your-bucket/*"`).
  - Add a `S3_BUCKET` environment variable with the name of your S3 bucket.
  - Add a `SLACK_TOKEN` environment variable with the `Bot User OAuth Access Token` from the Slack bot's `OAuth & Permissions`.
  - Add a `NODE_OPTIONS` environment variable with the value `--enable-source-maps`.

## Slack channel setup

Public channels can accept emails without any extra setup. Private channels can accept emails once the `EmailBot` app has been added in `Channel Details` -> `Apps`.

## How to deploy

- `npm install`
- `npm run package`
- Login to the AWS console and open your lambda.
- Scroll down to `Function code` and select `Upload a .zip file`.
- Upload `dist/aws-ses-to-slack.zip`.
- Click `Save`.

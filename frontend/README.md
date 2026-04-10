# PDF Conversation Frontend

React frontend application for the PDF Conversation System with Cognito authentication.

## Features

- **User Authentication** - Sign up, sign in, password reset via AWS Cognito
- **Document Upload** - Upload PDFs via presigned URLs to S3
- **Document Management** - View document status and processing progress
- **Semantic Search** - Query documents using natural language
- **RAG Generation** - Generate school book style summaries from your documents

## Prerequisites

1. Deploy the backend infrastructure:
   ```bash
   cd infrastructure/cdk
   npm install
   cdk deploy PdfConversationAuthStack
   ```

2. Get the outputs from CloudFormation:
   - UserPoolId
   - UserPoolClientId
   - IdentityPoolId
   - ApiEndpoint

## Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Update configuration in `src/aws-config.js`:
   ```javascript
   const awsConfig = {
     Auth: {
       Cognito: {
         userPoolId: 'us-west-2_YOUR_POOL_ID',
         userPoolClientId: 'YOUR_CLIENT_ID',
         identityPoolId: 'us-west-2:YOUR_IDENTITY_POOL_ID',
         // ...
       },
     },
     API: {
       REST: {
         PdfConversationApi: {
           endpoint: 'https://YOUR_API_ID.execute-api.us-west-2.amazonaws.com/v1',
           // ...
         },
       },
     },
   };
   ```

3. Alternatively, use environment variables:
   ```bash
   export REACT_APP_API_ENDPOINT=https://YOUR_API_ID.execute-api.us-west-2.amazonaws.com/v1
   ```

## Development

Start the development server:
```bash
npm start
```

The app will be available at http://localhost:3000

## Build

Create a production build:
```bash
npm run build
```

## Deployment Options

### Option 1: S3 + CloudFront (Recommended)

1. Build the app:
   ```bash
   npm run build
   ```

2. Create S3 bucket and CloudFront distribution
3. Upload build files to S3:
   ```bash
   aws s3 sync build/ s3://your-frontend-bucket --delete
   ```

### Option 2: AWS Amplify Hosting

1. Connect your repository to AWS Amplify Console
2. Configure build settings
3. Deploy automatically on push

## Architecture

```
frontend/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── components/
│   │   └── Header.js       # Navigation header
│   ├── pages/
│   │   ├── Dashboard.js    # Home dashboard
│   │   ├── Upload.js       # Document upload
│   │   ├── Documents.js    # Document list
│   │   └── Query.js        # Search interface
│   ├── aws-config.js       # Amplify configuration
│   ├── App.js              # Main app with auth
│   ├── index.js            # Entry point
│   └── index.css           # Global styles
└── package.json
```

## API Endpoints

The frontend uses these API endpoints (via API Gateway):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/documents` | GET | List user's documents |
| `/upload/presigned` | POST | Get presigned URL for upload |
| `/query` | POST | Search and generate summaries |

All endpoints require Cognito authentication token.

## Authentication Flow

1. User signs up with email
2. Email verification code sent
3. User verifies and can sign in
4. JWT tokens stored in memory
5. Tokens included in API requests
6. Identity Pool provides temporary AWS credentials for S3 upload

## Styling

The app uses custom CSS with:
- Responsive design (mobile-first)
- Purple gradient theme
- Card-based layout
- Status badges for document states

## Troubleshooting

### "Unauthorized" errors
- Ensure Cognito configuration is correct
- Check that tokens are being passed in Authorization header

### CORS errors
- Verify API Gateway CORS settings
- Check allowed origins include localhost:3000

### Upload failures
- Verify presigned URL endpoint is working
- Check S3 bucket policy allows uploads

## License

Part of the PDF Conversation System project.

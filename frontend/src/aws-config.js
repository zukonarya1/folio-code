const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID,
      loginWith: {
        email: true,
        ...(process.env.REACT_APP_USER_POOL_DOMAIN ? {
          oauth: {
            domain: process.env.REACT_APP_USER_POOL_DOMAIN,
            scopes: ['email', 'openid', 'profile'],
            redirectSignIn: [window.location.origin + '/login'],
            redirectSignOut: [window.location.origin + '/'],
            responseType: 'code',
          },
        } : {}),
      },
      signUpVerificationMethod: 'code',
      userAttributes: {
        email: {
          required: true,
        },
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: false,
      },
    },
  },
  API: {
    REST: {
      PdfConversationApi: {
        endpoint: process.env.REACT_APP_API_ENDPOINT,
        region: process.env.REACT_APP_AWS_REGION,
      },
    },
  },
  Storage: {
    S3: {
      bucket: process.env.REACT_APP_PROCESSING_BUCKET,
      region: process.env.REACT_APP_AWS_REGION,
    },
  },
};

export default awsConfig;

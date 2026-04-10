"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfConversationAuthStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class PdfConversationAuthStack extends cdk.Stack {
    userPool;
    userPoolClient;
    api;
    identityPool;
    constructor(scope, id, props) {
        super(scope, id, props);
        const p = props.envConfig.prefix;
        const domainPrefixMap = {
            prod: 'folio',
            staging: 'folio-staging',
            dev: 'folio-dev',
        };
        const domainPrefix = domainPrefixMap[props.envConfig.name] ?? `folio-${props.envConfig.name}`;
        const allowedOrigins = [
            'http://localhost:3000',
            ...(props.cloudFrontDomain ? [`https://${props.cloudFrontDomain}`] : []),
            ...(props.customDomainName ? [`https://${props.customDomainName}`] : []),
        ].join(',');
        // =================================================================
        // COGNITO LAMBDA TRIGGERS
        // =================================================================
        const customMessageFn = new lambda.Function(this, 'CustomMessageFunction', {
            functionName: `${p}CustomMessageTrigger`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            timeout: cdk.Duration.seconds(5),
            code: lambda.Code.fromInline(`
import json

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C0D10;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0C0D10;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 0 24px;">
            <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;margin-right:10px;">
              <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="#F56565" stroke-width="1.5"/>
              <polygon points="14,6 22,14 14,22 6,14" fill="#F56565" opacity="0.15"/>
              <line x1="14" y1="1" x2="14" y2="27" stroke="#F56565" opacity="0.4"/>
            </svg>
            <span style="font-family:'Courier New',monospace;font-weight:bold;font-size:18px;letter-spacing:3px;color:#E8ECF0;vertical-align:middle;">FOLIO</span>
          </td>
        </tr>
        <tr>
          <td style="background:#151720;border:1px solid #2A2D3A;border-radius:8px;padding:32px;">
            <h1 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:20px;font-weight:600;color:#E8ECF0;line-height:1.3;">Verify your Folio account.</h1>
            <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;color:#C4C9D4;line-height:1.6;">Use the code below to complete your sign-up. It expires in 24 hours.</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background:#1C1F2B;border:2px solid #F56565;border-radius:6px;padding:24px;">
                  <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;color:#F56565;letter-spacing:0.2em;">{code}</span>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#555B6E;line-height:1.5;">If you didn&#39;t create a Folio account, ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 0 0;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#555B6E;">folio.zukonarya.com &middot; ZukoNarya</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""

def lambda_handler(event, context):
    if event.get('triggerSource') == 'CustomMessage_SignUp':
        code = event['request'].get('codeParameter', '{####}')
        event['response']['emailSubject'] = 'Verify your Folio account'
        event['response']['emailMessage'] = HTML_TEMPLATE.replace('{code}', code)
    return event
`),
        });
        const preSignUpFn = new lambda.Function(this, 'PreSignUpFunction', {
            functionName: `${p}PreSignUpTrigger`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            timeout: cdk.Duration.seconds(5),
            code: lambda.Code.fromInline(`
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')

def lambda_handler(event, context):
    try:
        if event.get('triggerSource') != 'PreSignUp_ExternalProvider':
            return event

        user_pool_id = event['userPoolId']
        email = event['request']['userAttributes'].get('email', '')

        if not email:
            logger.warning('No email found in external provider sign-up attributes')
            return event

        list_response = cognito_client.list_users(
            UserPoolId=user_pool_id,
            Filter=f'email = "{email}"',
            Limit=1,
        )

        existing_users = list_response.get('Users', [])
        if not existing_users:
            return event

        existing_user = existing_users[0]
        existing_username = existing_user['Username']

        username_parts = event['userName'].split('_', 1)
        if len(username_parts) != 2:
            logger.warning(f'Unexpected userName format: {event["userName"]}')
            return event

        provider_name = username_parts[0]
        provider_user_id = username_parts[1]

        cognito_client.admin_link_provider_for_user(
            UserPoolId=user_pool_id,
            DestinationUser={
                'ProviderName': 'Cognito',
                'ProviderAttributeName': 'cognito:username',
                'ProviderAttributeValue': existing_username,
            },
            SourceUser={
                'ProviderName': provider_name,
                'ProviderAttributeName': 'Cognito_Subject',
                'ProviderAttributeValue': provider_user_id,
            },
        )

        logger.info(f'Linked {provider_name} identity to existing user {existing_username}')
    except Exception as e:
        logger.error(f'PreSignUp linking error: {e}')
    return event
`),
        });
        // =================================================================
        // COGNITO USER POOL
        // =================================================================
        this.userPool = new cognito.UserPool(this, 'PdfConversationUserPool', {
            userPoolName: `${p}pdf-conversation-users`,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
                username: false,
            },
            autoVerify: {
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
                givenName: {
                    required: false,
                    mutable: true,
                },
                familyName: {
                    required: false,
                    mutable: true,
                },
                fullname: {
                    required: false,
                    mutable: true,
                },
            },
            customAttributes: {
                'organization': new cognito.StringAttribute({ mutable: true }),
                'role': new cognito.StringAttribute({ mutable: true }),
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
                tempPasswordValidity: cdk.Duration.days(7),
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            // Email verification
            userVerification: {
                emailSubject: 'Verify your PDF Conversation account',
                emailBody: 'Thanks for signing up! Your verification code is {####}',
                emailStyle: cognito.VerificationEmailStyle.CODE,
            },
        });
        const cfnUserPool = this.userPool.node.defaultChild;
        cfnUserPool.lambdaConfig = {
            preSignUp: preSignUpFn.functionArn,
            customMessage: customMessageFn.functionArn,
        };
        preSignUpFn.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'cognito-idp:AdminGetUser',
                'cognito-idp:ListUsers',
                'cognito-idp:AdminLinkProviderForUser',
            ],
            resources: [`arn:aws:cognito-idp:${props.envConfig.region}:${props.envConfig.accountId}:userpool/*`],
        }));
        customMessageFn.addPermission('CognitoInvokeCustomMessage', {
            principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
            action: 'lambda:InvokeFunction',
            sourceAccount: this.account,
        });
        preSignUpFn.addPermission('CognitoInvokePreSignUp', {
            principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
            action: 'lambda:InvokeFunction',
            sourceAccount: this.account,
        });
        // =================================================================
        // GOOGLE IDENTITY PROVIDER
        // =================================================================
        const googleIdP = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdentityProvider', {
            userPool: this.userPool,
            clientId: cdk.SecretValue.secretsManager(`/pdfconv/${props.envConfig.name}/google-client-id`).unsafeUnwrap(),
            clientSecret: cdk.SecretValue.secretsManager(`/pdfconv/${props.envConfig.name}/google-client-secret`).unsafeUnwrap(),
            scopes: ['email', 'profile', 'openid'],
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
                familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
                fullname: cognito.ProviderAttribute.GOOGLE_NAME,
            },
        });
        // =================================================================
        // USER POOL DOMAIN
        // =================================================================
        new cognito.UserPoolDomain(this, 'UserPoolDomain', {
            userPool: this.userPool,
            cognitoDomain: {
                domainPrefix,
            },
        });
        // =================================================================
        // USER POOL CLIENT
        // =================================================================
        // User Pool Client (for frontend app)
        this.userPoolClient = this.userPool.addClient('PdfConversationWebClient', {
            userPoolClientName: `${p}pdf-conversation-web-client`,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
                cognito.UserPoolClientIdentityProvider.GOOGLE,
            ],
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: false,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [
                    'http://localhost:3000/callback',
                    'http://localhost:3000/',
                    'http://localhost:3000/login',
                    ...(props.cloudFrontDomain ? [
                        `https://${props.cloudFrontDomain}/callback`,
                        `https://${props.cloudFrontDomain}/`,
                        `https://${props.cloudFrontDomain}/login`,
                    ] : []),
                    ...(props.customDomainName ? [
                        `https://${props.customDomainName}/callback`,
                        `https://${props.customDomainName}/`,
                        `https://${props.customDomainName}/login`,
                    ] : []),
                ],
                logoutUrls: [
                    'http://localhost:3000/',
                    ...(props.cloudFrontDomain ? [
                        `https://${props.cloudFrontDomain}/`,
                    ] : []),
                    ...(props.customDomainName ? [
                        `https://${props.customDomainName}/`,
                    ] : []),
                ],
            },
            preventUserExistenceErrors: true,
            accessTokenValidity: cdk.Duration.hours(1),
            idTokenValidity: cdk.Duration.hours(1),
            refreshTokenValidity: cdk.Duration.days(30),
            readAttributes: new cognito.ClientAttributes()
                .withStandardAttributes({ email: true, givenName: true, familyName: true, fullname: true })
                .withCustomAttributes('organization', 'role'),
        });
        this.userPoolClient.node.addDependency(googleIdP);
        // =================================================================
        // COGNITO IDENTITY POOL (for S3 direct upload)
        // =================================================================
        this.identityPool = new cognito.CfnIdentityPool(this, 'PdfConversationIdentityPool', {
            identityPoolName: `${p.replace(/-/g, '_')}pdf_conversation_identity_pool`,
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: this.userPoolClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName,
                },
            ],
        });
        // IAM Role for authenticated users
        const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
            roleName: `${p}PdfConversation-CognitoAuthRole`,
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'authenticated',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
        });
        // Allow authenticated users to upload to their own folder in S3
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:PutObject',
                's3:GetObject',
                's3:DeleteObject',
            ],
            resources: [
                `${props.processingBucket.bucketArn}/users/\${cognito-identity.amazonaws.com:sub}/*`,
            ],
        }));
        // Allow authenticated users to list their own folder
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:ListBucket',
            ],
            resources: [props.processingBucket.bucketArn],
            conditions: {
                StringLike: {
                    's3:prefix': ['users/${cognito-identity.amazonaws.com:sub}/*'],
                },
            },
        }));
        // Attach role to identity pool
        new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
            identityPoolId: this.identityPool.ref,
            roles: {
                authenticated: authenticatedRole.roleArn,
            },
        });
        // =================================================================
        // API GATEWAY
        // =================================================================
        this.api = new apigateway.RestApi(this, 'PdfConversationApi', {
            restApiName: 'PDF Conversation API',
            description: 'API for PDF Conversation System',
            deployOptions: {
                stageName: 'v1',
                throttlingBurstLimit: 100,
                throttlingRateLimit: 50,
            },
            defaultCorsPreflightOptions: {
                allowOrigins: [
                    'http://localhost:3000',
                    ...(props.cloudFrontDomain ? [`https://${props.cloudFrontDomain}`] : []),
                    ...(props.customDomainName ? [`https://${props.customDomainName}`] : []),
                ],
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                ],
                allowCredentials: true,
            },
        });
        // Cognito Authorizer
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [this.userPool],
            authorizerName: 'CognitoAuthorizer',
            identitySource: 'method.request.header.Authorization',
        });
        // =================================================================
        // API ENDPOINTS
        // =================================================================
        // Query endpoint - POST /query
        const queryResource = this.api.root.addResource('query');
        queryResource.addMethod('POST', new apigateway.LambdaIntegration(props.queryProcessingFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Documents endpoint - GET /documents (list user's documents)
        const documentsResource = this.api.root.addResource('documents');
        // Lambda for listing documents
        const listDocumentsFunction = new lambda.Function(this, 'ListDocumentsFunction', {
            functionName: `${p}ListDocuments`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['METADATA_TABLE'])

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")

    # Get user_id from Cognito claims
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    try:
        # Query documents for this user
        response = table.scan(
            FilterExpression=Key('user_id').eq(user_id)
        )

        documents = [{
            'document_id': item['document_id'],
            'filename': item.get('original_filename', 'Unknown'),
            'status': item.get('status', 'unknown'),
            'created_at': item.get('created_at', ''),
            'vector_count': int(item.get('vector_count', 0)) if item.get('vector_count') else 0
        } for item in response.get('Items', [])]

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps({
                'documents': documents,
                'count': len(documents)
            })
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': str(e)})
        }
`),
            environment: {
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(30),
        });
        // Grant DynamoDB read access
        listDocumentsFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:Scan',
                'dynamodb:Query',
            ],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        documentsResource.addMethod('GET', new apigateway.LambdaIntegration(listDocumentsFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Upload presigned URL endpoint - POST /upload/presigned
        const uploadResource = this.api.root.addResource('upload');
        const presignedResource = uploadResource.addResource('presigned');
        const presignedUrlFunction = new lambda.Function(this, 'PresignedUrlFunction', {
            functionName: `${p}GeneratePresignedUrl`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
import re
import uuid
from datetime import datetime

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
BUCKET_NAME = os.environ['BUCKET_NAME']
METADATA_TABLE = os.environ['METADATA_TABLE']

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")

    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    try:
        body = json.loads(event.get('body', '{}'))
        original_filename = body.get('filename', 'document.pdf')
        original_filename = re.sub(r'[/\\\\<>:"|?*\\x00-\\x1f]', '_', original_filename)
        if len(original_filename) > 255:
            original_filename = original_filename[:255]
        content_type = body.get('content_type', 'application/pdf')

        document_id = str(uuid.uuid4())
        s3_key = f"users/{user_id}/{document_id}.pdf"

        table = dynamodb.Table(METADATA_TABLE)
        table.put_item(Item={
            'document_id': document_id,
            'user_id': user_id,
            'original_filename': original_filename,
            'original_s3_location': {'bucket': BUCKET_NAME, 'key': s3_key},
            'status': 'uploading',
            'created_at': datetime.utcnow().isoformat(),
            'processing_metadata': {}
        })

        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=3600
        )

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps({
                'presigned_url': presigned_url,
                'document_id': document_id,
                'expires_in': 3600
            })
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Failed to generate upload URL'})
        }
`),
            environment: {
                BUCKET_NAME: props.processingBucket.bucketName,
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(30),
        });
        // Grant S3 permissions for presigned URLs
        presignedUrlFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:PutObject'],
            resources: [`${props.processingBucket.bucketArn}/*`],
        }));
        presignedUrlFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        presignedResource.addMethod('POST', new apigateway.LambdaIntegration(presignedUrlFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const getDocumentSummaryFunction = new lambda.Function(this, 'GetDocumentSummaryFunction', {
            functionName: `${p}GetDocumentSummary`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['METADATA_TABLE'])

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError

def lambda_handler(event, context):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    path_params = event.get('pathParameters') or {}
    document_id = path_params.get('id', '')

    if not document_id:
        return {
            'statusCode': 400,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Missing document ID'})
        }

    try:
        response = table.get_item(Key={'document_id': document_id})

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': cors_headers(event),
                'body': json.dumps({'error': 'Document not found'})
            }

        item = response['Item']

        if item.get('user_id', '') != user_id:
            return {
                'statusCode': 404,
                'headers': cors_headers(event),
                'body': json.dumps({'error': 'Document not found'})
            }

        result = {
            'document_id': item['document_id'],
            'filename': item.get('original_filename', 'Unknown'),
            'status': item.get('status', 'unknown'),
            'generated_summary': item.get('generated_summary')
        }

        if 'summary_generated_at' in item:
            result['summary_generated_at'] = item['summary_generated_at']

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps(result, default=decimal_default)
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': str(e)})
        }
`),
            environment: {
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(30),
        });
        getDocumentSummaryFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:GetItem'],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        const documentIdResource = documentsResource.addResource('{id}');
        const summaryResource = documentIdResource.addResource('summary');
        summaryResource.addMethod('GET', new apigateway.LambdaIntegration(getDocumentSummaryFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const conversationsResource = documentIdResource.addResource('conversations');
        conversationsResource.addMethod('GET', new apigateway.LambdaIntegration(props.conversationFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        conversationsResource.addMethod('POST', new apigateway.LambdaIntegration(props.conversationFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const conversationIdResource = conversationsResource.addResource('{convId}');
        conversationIdResource.addMethod('GET', new apigateway.LambdaIntegration(props.conversationFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Delete account endpoint - DELETE /users/me
        const deleteAccountFunction = new lambda.Function(this, 'DeleteAccountFunction', {
            functionName: `${p}DeleteAccount`,
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
from boto3.dynamodb.conditions import Attr

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
BUCKET_NAME = os.environ['BUCKET_NAME']
METADATA_TABLE = os.environ['METADATA_TABLE']

ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

def get_cors_origin(event):
    origin = (event.get('headers') or {}).get('origin') or (event.get('headers') or {}).get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]

def cors_headers(event):
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': get_cors_origin(event),
        'Access-Control-Allow-Credentials': 'true'
    }

def lambda_handler(event, context):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub', '')

    if not user_id:
        return {
            'statusCode': 401,
            'headers': cors_headers(event),
            'body': json.dumps({'error': 'Unauthorized'})
        }

    try:
        table = dynamodb.Table(METADATA_TABLE)

        # Scan for all documents belonging to this user
        response = table.scan(FilterExpression=Attr('user_id').eq(user_id))
        items = response.get('Items', [])
        while 'LastEvaluatedKey' in response:
            response = table.scan(
                FilterExpression=Attr('user_id').eq(user_id),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            items.extend(response.get('Items', []))

        # Delete each tracked S3 object
        for item in items:
            s3_loc = item.get('original_s3_location', {})
            key = s3_loc.get('key', '')
            if key:
                s3_client.delete_object(Bucket=BUCKET_NAME, Key=key)

        # Delete any orphaned objects under users/{user_id}/
        paginator = s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=f'users/{user_id}/'):
            objects = [{'Key': obj['Key']} for obj in page.get('Contents', [])]
            if objects:
                s3_client.delete_objects(Bucket=BUCKET_NAME, Delete={'Objects': objects})

        # Batch-delete DynamoDB records
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={'document_id': item['document_id']})

        return {
            'statusCode': 200,
            'headers': cors_headers(event),
            'body': json.dumps({'message': 'Account data deleted'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers(event),
            'body': json.dumps({'error': str(e)})
        }
`),
            environment: {
                BUCKET_NAME: props.processingBucket.bucketName,
                METADATA_TABLE: props.metadataTableName,
                ALLOWED_ORIGINS: allowedOrigins,
            },
            timeout: cdk.Duration.seconds(60),
        });
        deleteAccountFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:Scan', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem'],
            resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.metadataTableName}`],
        }));
        deleteAccountFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:DeleteObject', 's3:ListBucket'],
            resources: [props.processingBucket.bucketArn, `${props.processingBucket.bucketArn}/*`],
        }));
        const usersResource = this.api.root.addResource('users');
        const meResource = usersResource.addResource('me');
        meResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteAccountFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const usageResource = meResource.addResource('usage');
        usageResource.addMethod('GET', new apigateway.LambdaIntegration(props.usageFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // =================================================================
        // OUTPUTS
        // =================================================================
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: `${p}PdfConversation-UserPoolId`,
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: `${p}PdfConversation-UserPoolClientId`,
        });
        new cdk.CfnOutput(this, 'IdentityPoolId', {
            value: this.identityPool.ref,
            description: 'Cognito Identity Pool ID',
            exportName: `${p}PdfConversation-IdentityPoolId`,
        });
        new cdk.CfnOutput(this, 'ApiEndpoint', {
            value: this.api.url,
            description: 'API Gateway Endpoint URL',
            exportName: `${p}PdfConversation-ApiEndpoint`,
        });
        new cdk.CfnOutput(this, 'CognitoRegion', {
            value: this.region,
            description: 'AWS Region for Cognito',
            exportName: `${p}PdfConversation-CognitoRegion`,
        });
        new cdk.CfnOutput(this, 'UserPoolDomainOutput', {
            value: `${domainPrefix}.auth.${this.region}.amazoncognito.com`,
            description: 'Cognito User Pool Domain',
            exportName: `${p}PdfConversation-UserPoolDomain`,
        });
    }
}
exports.PdfConversationAuthStack = PdfConversationAuthStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1hdXRoLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGRmLWNvbnZlcnNhdGlvbi1hdXRoLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLGlFQUFtRDtBQUNuRCx1RUFBeUQ7QUFDekQsK0RBQWlEO0FBQ2pELHlEQUEyQztBQWdCM0MsTUFBYSx3QkFBeUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNyQyxRQUFRLENBQW1CO0lBQzNCLGNBQWMsQ0FBeUI7SUFDdkMsR0FBRyxDQUFxQjtJQUN4QixZQUFZLENBQTBCO0lBRXRELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFFakMsTUFBTSxlQUFlLEdBQTJCO1lBQzlDLElBQUksRUFBRSxPQUFPO1lBQ2IsT0FBTyxFQUFFLGVBQWU7WUFDeEIsR0FBRyxFQUFFLFdBQVc7U0FDakIsQ0FBQztRQUNGLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU5RixNQUFNLGNBQWMsR0FBRztZQUNyQix1QkFBdUI7WUFDdkIsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN4RSxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENB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QUFDLGdDQUFnQztTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ25CLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLEdBQUcsQ0FBQyw2QkFBNkI7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ2xCLFdBQVcsRUFBRSx3QkFBd0I7WUFDckMsVUFBVSxFQUFFLEdBQUcsQ0FBQywrQkFBK0I7U0FDaEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsR0FBRyxZQUFZLFNBQVMsSUFBSSxDQUFDLE1BQU0sb0JBQW9CO1lBQzlELFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxnQ0FBZ0M7U0FDakQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdjdCRCw0REF1N0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBQZGZDb252ZXJzYXRpb25BdXRoU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgcmVhZG9ubHkgcXVlcnlQcm9jZXNzaW5nRnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IGRvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IHByb2Nlc3NpbmdCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIHJlYWRvbmx5IG1ldGFkYXRhVGFibGVOYW1lOiBzdHJpbmc7XG4gIHJlYWRvbmx5IGNvbnZlcnNhdGlvbkZ1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSB1c2FnZUZ1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSBjbG91ZEZyb250RG9tYWluPzogc3RyaW5nO1xuICByZWFkb25seSBjdXN0b21Eb21haW5OYW1lPzogc3RyaW5nO1xuICByZWFkb25seSBlbnZDb25maWc6IEVudmlyb25tZW50Q29uZmlnO1xufVxuXG5leHBvcnQgY2xhc3MgUGRmQ29udmVyc2F0aW9uQXV0aFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGlkZW50aXR5UG9vbDogY29nbml0by5DZm5JZGVudGl0eVBvb2w7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFBkZkNvbnZlcnNhdGlvbkF1dGhTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBwID0gcHJvcHMuZW52Q29uZmlnLnByZWZpeDtcblxuICAgIGNvbnN0IGRvbWFpblByZWZpeE1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgIHByb2Q6ICdmb2xpbycsXG4gICAgICBzdGFnaW5nOiAnZm9saW8tc3RhZ2luZycsXG4gICAgICBkZXY6ICdmb2xpby1kZXYnLFxuICAgIH07XG4gICAgY29uc3QgZG9tYWluUHJlZml4ID0gZG9tYWluUHJlZml4TWFwW3Byb3BzLmVudkNvbmZpZy5uYW1lXSA/PyBgZm9saW8tJHtwcm9wcy5lbnZDb25maWcubmFtZX1gO1xuXG4gICAgY29uc3QgYWxsb3dlZE9yaWdpbnMgPSBbXG4gICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgIC4uLihwcm9wcy5jbG91ZEZyb250RG9tYWluID8gW2BodHRwczovLyR7cHJvcHMuY2xvdWRGcm9udERvbWFpbn1gXSA6IFtdKSxcbiAgICAgIC4uLihwcm9wcy5jdXN0b21Eb21haW5OYW1lID8gW2BodHRwczovLyR7cHJvcHMuY3VzdG9tRG9tYWluTmFtZX1gXSA6IFtdKSxcbiAgICBdLmpvaW4oJywnKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ09HTklUTyBMQU1CREEgVFJJR0dFUlNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgY29uc3QgY3VzdG9tTWVzc2FnZUZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ3VzdG9tTWVzc2FnZUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfUN1c3RvbU1lc3NhZ2VUcmlnZ2VyYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5cbkhUTUxfVEVNUExBVEUgPSBcIlwiXCI8IURPQ1RZUEUgaHRtbD5cbjxodG1sIGxhbmc9XCJlblwiPlxuPGhlYWQ+PG1ldGEgY2hhcnNldD1cIlVURi04XCI+PG1ldGEgbmFtZT1cInZpZXdwb3J0XCIgY29udGVudD1cIndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTFcIj48L2hlYWQ+XG48Ym9keSBzdHlsZT1cIm1hcmdpbjowO3BhZGRpbmc6MDtiYWNrZ3JvdW5kOiMwQzBEMTA7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtcIj5cbjx0YWJsZSB3aWR0aD1cIjEwMCVcIiBjZWxscGFkZGluZz1cIjBcIiBjZWxsc3BhY2luZz1cIjBcIiBib3JkZXI9XCIwXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiMwQzBEMTA7bWluLWhlaWdodDoxMDB2aDtcIj5cbiAgPHRyPlxuICAgIDx0ZCBhbGlnbj1cImNlbnRlclwiIHN0eWxlPVwicGFkZGluZzo0MHB4IDE2cHg7XCI+XG4gICAgICA8dGFibGUgd2lkdGg9XCI2MDBcIiBjZWxscGFkZGluZz1cIjBcIiBjZWxsc3BhY2luZz1cIjBcIiBib3JkZXI9XCIwXCIgc3R5bGU9XCJtYXgtd2lkdGg6NjAwcHg7d2lkdGg6MTAwJTtcIj5cbiAgICAgICAgPHRyPlxuICAgICAgICAgIDx0ZCBhbGlnbj1cImNlbnRlclwiIHN0eWxlPVwicGFkZGluZzozMnB4IDAgMjRweDtcIj5cbiAgICAgICAgICAgIDxzdmcgd2lkdGg9XCIyOFwiIGhlaWdodD1cIjI4XCIgdmlld0JveD1cIjAgMCAyOCAyOFwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBzdHlsZT1cImRpc3BsYXk6aW5saW5lLWJsb2NrO3ZlcnRpY2FsLWFsaWduOm1pZGRsZTttYXJnaW4tcmlnaHQ6MTBweDtcIj5cbiAgICAgICAgICAgICAgPHBvbHlnb24gcG9pbnRzPVwiMTQsMSAyNywxNCAxNCwyNyAxLDE0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCIjRjU2NTY1XCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIvPlxuICAgICAgICAgICAgICA8cG9seWdvbiBwb2ludHM9XCIxNCw2IDIyLDE0IDE0LDIyIDYsMTRcIiBmaWxsPVwiI0Y1NjU2NVwiIG9wYWNpdHk9XCIwLjE1XCIvPlxuICAgICAgICAgICAgICA8bGluZSB4MT1cIjE0XCIgeTE9XCIxXCIgeDI9XCIxNFwiIHkyPVwiMjdcIiBzdHJva2U9XCIjRjU2NTY1XCIgb3BhY2l0eT1cIjAuNFwiLz5cbiAgICAgICAgICAgIDwvc3ZnPlxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LWZhbWlseTonQ291cmllciBOZXcnLG1vbm9zcGFjZTtmb250LXdlaWdodDpib2xkO2ZvbnQtc2l6ZToxOHB4O2xldHRlci1zcGFjaW5nOjNweDtjb2xvcjojRThFQ0YwO3ZlcnRpY2FsLWFsaWduOm1pZGRsZTtcIj5GT0xJTzwvc3Bhbj5cbiAgICAgICAgICA8L3RkPlxuICAgICAgICA8L3RyPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRkIHN0eWxlPVwiYmFja2dyb3VuZDojMTUxNzIwO2JvcmRlcjoxcHggc29saWQgIzJBMkQzQTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjMycHg7XCI+XG4gICAgICAgICAgICA8aDEgc3R5bGU9XCJtYXJnaW46MCAwIDE2cHg7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MjBweDtmb250LXdlaWdodDo2MDA7Y29sb3I6I0U4RUNGMDtsaW5lLWhlaWdodDoxLjM7XCI+VmVyaWZ5IHlvdXIgRm9saW8gYWNjb3VudC48L2gxPlxuICAgICAgICAgICAgPHAgc3R5bGU9XCJtYXJnaW46MCAwIDI0cHg7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MTRweDtjb2xvcjojQzRDOUQ0O2xpbmUtaGVpZ2h0OjEuNjtcIj5Vc2UgdGhlIGNvZGUgYmVsb3cgdG8gY29tcGxldGUgeW91ciBzaWduLXVwLiBJdCBleHBpcmVzIGluIDI0IGhvdXJzLjwvcD5cbiAgICAgICAgICAgIDx0YWJsZSB3aWR0aD1cIjEwMCVcIiBjZWxscGFkZGluZz1cIjBcIiBjZWxsc3BhY2luZz1cIjBcIiBib3JkZXI9XCIwXCI+XG4gICAgICAgICAgICAgIDx0cj5cbiAgICAgICAgICAgICAgICA8dGQgYWxpZ249XCJjZW50ZXJcIiBzdHlsZT1cImJhY2tncm91bmQ6IzFDMUYyQjtib3JkZXI6MnB4IHNvbGlkICNGNTY1NjU7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoyNHB4O1wiPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LWZhbWlseTonQ291cmllciBOZXcnLG1vbm9zcGFjZTtmb250LXNpemU6MzJweDtmb250LXdlaWdodDpib2xkO2NvbG9yOiNGNTY1NjU7bGV0dGVyLXNwYWNpbmc6MC4yZW07XCI+e2NvZGV9PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgICAgICAgIDwvdHI+XG4gICAgICAgICAgICA8L3RhYmxlPlxuICAgICAgICAgICAgPHAgc3R5bGU9XCJtYXJnaW46MjRweCAwIDA7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MTJweDtjb2xvcjojNTU1QjZFO2xpbmUtaGVpZ2h0OjEuNTtcIj5JZiB5b3UgZGlkbiYjMzk7dCBjcmVhdGUgYSBGb2xpbyBhY2NvdW50LCBpZ25vcmUgdGhpcyBlbWFpbC48L3A+XG4gICAgICAgICAgPC90ZD5cbiAgICAgICAgPC90cj5cbiAgICAgICAgPHRyPlxuICAgICAgICAgIDx0ZCBhbGlnbj1cImNlbnRlclwiIHN0eWxlPVwicGFkZGluZzoyMHB4IDAgMDtcIj5cbiAgICAgICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjA7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MTFweDtjb2xvcjojNTU1QjZFO1wiPmZvbGlvLnp1a29uYXJ5YS5jb20gJm1pZGRvdDsgWnVrb05hcnlhPC9wPlxuICAgICAgICAgIDwvdGQ+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3RhYmxlPlxuICAgIDwvdGQ+XG4gIDwvdHI+XG48L3RhYmxlPlxuPC9ib2R5PlxuPC9odG1sPlwiXCJcIlxuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGlmIGV2ZW50LmdldCgndHJpZ2dlclNvdXJjZScpID09ICdDdXN0b21NZXNzYWdlX1NpZ25VcCc6XG4gICAgICAgIGNvZGUgPSBldmVudFsncmVxdWVzdCddLmdldCgnY29kZVBhcmFtZXRlcicsICd7IyMjI30nKVxuICAgICAgICBldmVudFsncmVzcG9uc2UnXVsnZW1haWxTdWJqZWN0J10gPSAnVmVyaWZ5IHlvdXIgRm9saW8gYWNjb3VudCdcbiAgICAgICAgZXZlbnRbJ3Jlc3BvbnNlJ11bJ2VtYWlsTWVzc2FnZSddID0gSFRNTF9URU1QTEFURS5yZXBsYWNlKCd7Y29kZX0nLCBjb2RlKVxuICAgIHJldHVybiBldmVudFxuYCksXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmVTaWduVXBGbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1ByZVNpZ25VcEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfVByZVNpZ25VcFRyaWdnZXJgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IGxvZ2dpbmdcblxubG9nZ2VyID0gbG9nZ2luZy5nZXRMb2dnZXIoKVxubG9nZ2VyLnNldExldmVsKGxvZ2dpbmcuSU5GTylcblxuY29nbml0b19jbGllbnQgPSBib3RvMy5jbGllbnQoJ2NvZ25pdG8taWRwJylcblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICB0cnk6XG4gICAgICAgIGlmIGV2ZW50LmdldCgndHJpZ2dlclNvdXJjZScpICE9ICdQcmVTaWduVXBfRXh0ZXJuYWxQcm92aWRlcic6XG4gICAgICAgICAgICByZXR1cm4gZXZlbnRcblxuICAgICAgICB1c2VyX3Bvb2xfaWQgPSBldmVudFsndXNlclBvb2xJZCddXG4gICAgICAgIGVtYWlsID0gZXZlbnRbJ3JlcXVlc3QnXVsndXNlckF0dHJpYnV0ZXMnXS5nZXQoJ2VtYWlsJywgJycpXG5cbiAgICAgICAgaWYgbm90IGVtYWlsOlxuICAgICAgICAgICAgbG9nZ2VyLndhcm5pbmcoJ05vIGVtYWlsIGZvdW5kIGluIGV4dGVybmFsIHByb3ZpZGVyIHNpZ24tdXAgYXR0cmlidXRlcycpXG4gICAgICAgICAgICByZXR1cm4gZXZlbnRcblxuICAgICAgICBsaXN0X3Jlc3BvbnNlID0gY29nbml0b19jbGllbnQubGlzdF91c2VycyhcbiAgICAgICAgICAgIFVzZXJQb29sSWQ9dXNlcl9wb29sX2lkLFxuICAgICAgICAgICAgRmlsdGVyPWYnZW1haWwgPSBcIntlbWFpbH1cIicsXG4gICAgICAgICAgICBMaW1pdD0xLFxuICAgICAgICApXG5cbiAgICAgICAgZXhpc3RpbmdfdXNlcnMgPSBsaXN0X3Jlc3BvbnNlLmdldCgnVXNlcnMnLCBbXSlcbiAgICAgICAgaWYgbm90IGV4aXN0aW5nX3VzZXJzOlxuICAgICAgICAgICAgcmV0dXJuIGV2ZW50XG5cbiAgICAgICAgZXhpc3RpbmdfdXNlciA9IGV4aXN0aW5nX3VzZXJzWzBdXG4gICAgICAgIGV4aXN0aW5nX3VzZXJuYW1lID0gZXhpc3RpbmdfdXNlclsnVXNlcm5hbWUnXVxuXG4gICAgICAgIHVzZXJuYW1lX3BhcnRzID0gZXZlbnRbJ3VzZXJOYW1lJ10uc3BsaXQoJ18nLCAxKVxuICAgICAgICBpZiBsZW4odXNlcm5hbWVfcGFydHMpICE9IDI6XG4gICAgICAgICAgICBsb2dnZXIud2FybmluZyhmJ1VuZXhwZWN0ZWQgdXNlck5hbWUgZm9ybWF0OiB7ZXZlbnRbXCJ1c2VyTmFtZVwiXX0nKVxuICAgICAgICAgICAgcmV0dXJuIGV2ZW50XG5cbiAgICAgICAgcHJvdmlkZXJfbmFtZSA9IHVzZXJuYW1lX3BhcnRzWzBdXG4gICAgICAgIHByb3ZpZGVyX3VzZXJfaWQgPSB1c2VybmFtZV9wYXJ0c1sxXVxuXG4gICAgICAgIGNvZ25pdG9fY2xpZW50LmFkbWluX2xpbmtfcHJvdmlkZXJfZm9yX3VzZXIoXG4gICAgICAgICAgICBVc2VyUG9vbElkPXVzZXJfcG9vbF9pZCxcbiAgICAgICAgICAgIERlc3RpbmF0aW9uVXNlcj17XG4gICAgICAgICAgICAgICAgJ1Byb3ZpZGVyTmFtZSc6ICdDb2duaXRvJyxcbiAgICAgICAgICAgICAgICAnUHJvdmlkZXJBdHRyaWJ1dGVOYW1lJzogJ2NvZ25pdG86dXNlcm5hbWUnLFxuICAgICAgICAgICAgICAgICdQcm92aWRlckF0dHJpYnV0ZVZhbHVlJzogZXhpc3RpbmdfdXNlcm5hbWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgU291cmNlVXNlcj17XG4gICAgICAgICAgICAgICAgJ1Byb3ZpZGVyTmFtZSc6IHByb3ZpZGVyX25hbWUsXG4gICAgICAgICAgICAgICAgJ1Byb3ZpZGVyQXR0cmlidXRlTmFtZSc6ICdDb2duaXRvX1N1YmplY3QnLFxuICAgICAgICAgICAgICAgICdQcm92aWRlckF0dHJpYnV0ZVZhbHVlJzogcHJvdmlkZXJfdXNlcl9pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIClcblxuICAgICAgICBsb2dnZXIuaW5mbyhmJ0xpbmtlZCB7cHJvdmlkZXJfbmFtZX0gaWRlbnRpdHkgdG8gZXhpc3RpbmcgdXNlciB7ZXhpc3RpbmdfdXNlcm5hbWV9JylcbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIGxvZ2dlci5lcnJvcihmJ1ByZVNpZ25VcCBsaW5raW5nIGVycm9yOiB7ZX0nKVxuICAgIHJldHVybiBldmVudFxuYCksXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENPR05JVE8gVVNFUiBQT09MXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUGRmQ29udmVyc2F0aW9uVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgIHVzZXJuYW1lOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGdpdmVuTmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmYW1pbHlOYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bGxuYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICAnb3JnYW5pemF0aW9uJzogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgJ3JvbGUnOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgICB0ZW1wUGFzc3dvcmRWYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgLy8gRW1haWwgdmVyaWZpY2F0aW9uXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogJ1ZlcmlmeSB5b3VyIFBERiBDb252ZXJzYXRpb24gYWNjb3VudCcsXG4gICAgICAgIGVtYWlsQm9keTogJ1RoYW5rcyBmb3Igc2lnbmluZyB1cCEgWW91ciB2ZXJpZmljYXRpb24gY29kZSBpcyB7IyMjI30nLFxuICAgICAgICBlbWFpbFN0eWxlOiBjb2duaXRvLlZlcmlmaWNhdGlvbkVtYWlsU3R5bGUuQ09ERSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBjZm5Vc2VyUG9vbCA9IHRoaXMudXNlclBvb2wubm9kZS5kZWZhdWx0Q2hpbGQgYXMgY29nbml0by5DZm5Vc2VyUG9vbDtcbiAgICBjZm5Vc2VyUG9vbC5sYW1iZGFDb25maWcgPSB7XG4gICAgICBwcmVTaWduVXA6IHByZVNpZ25VcEZuLmZ1bmN0aW9uQXJuLFxuICAgICAgY3VzdG9tTWVzc2FnZTogY3VzdG9tTWVzc2FnZUZuLmZ1bmN0aW9uQXJuLFxuICAgIH07XG5cbiAgICBwcmVTaWduVXBGbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgJ2NvZ25pdG8taWRwOkxpc3RVc2VycycsXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkxpbmtQcm92aWRlckZvclVzZXInLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmNvZ25pdG8taWRwOiR7cHJvcHMuZW52Q29uZmlnLnJlZ2lvbn06JHtwcm9wcy5lbnZDb25maWcuYWNjb3VudElkfTp1c2VycG9vbC8qYF0sXG4gICAgfSkpO1xuXG4gICAgY3VzdG9tTWVzc2FnZUZuLmFkZFBlcm1pc3Npb24oJ0NvZ25pdG9JbnZva2VDdXN0b21NZXNzYWdlJywge1xuICAgICAgcHJpbmNpcGFsOiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2NvZ25pdG8taWRwLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGFjdGlvbjogJ2xhbWJkYTpJbnZva2VGdW5jdGlvbicsXG4gICAgICBzb3VyY2VBY2NvdW50OiB0aGlzLmFjY291bnQsXG4gICAgfSk7XG5cbiAgICBwcmVTaWduVXBGbi5hZGRQZXJtaXNzaW9uKCdDb2duaXRvSW52b2tlUHJlU2lnblVwJywge1xuICAgICAgcHJpbmNpcGFsOiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2NvZ25pdG8taWRwLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGFjdGlvbjogJ2xhbWJkYTpJbnZva2VGdW5jdGlvbicsXG4gICAgICBzb3VyY2VBY2NvdW50OiB0aGlzLmFjY291bnQsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEdPT0dMRSBJREVOVElUWSBQUk9WSURFUlxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBjb25zdCBnb29nbGVJZFAgPSBuZXcgY29nbml0by5Vc2VyUG9vbElkZW50aXR5UHJvdmlkZXJHb29nbGUodGhpcywgJ0dvb2dsZUlkZW50aXR5UHJvdmlkZXInLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIGNsaWVudElkOiBjZGsuU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoYC9wZGZjb252LyR7cHJvcHMuZW52Q29uZmlnLm5hbWV9L2dvb2dsZS1jbGllbnQtaWRgKS51bnNhZmVVbndyYXAoKSxcbiAgICAgIGNsaWVudFNlY3JldDogY2RrLlNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKGAvcGRmY29udi8ke3Byb3BzLmVudkNvbmZpZy5uYW1lfS9nb29nbGUtY2xpZW50LXNlY3JldGApLnVuc2FmZVVud3JhcCgpLFxuICAgICAgc2NvcGVzOiBbJ2VtYWlsJywgJ3Byb2ZpbGUnLCAnb3BlbmlkJ10sXG4gICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgIGVtYWlsOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9FTUFJTCxcbiAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9HSVZFTl9OQU1FLFxuICAgICAgICBmYW1pbHlOYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9GQU1JTFlfTkFNRSxcbiAgICAgICAgZnVsbG5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX05BTUUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBVU0VSIFBPT0wgRE9NQUlOXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIG5ldyBjb2duaXRvLlVzZXJQb29sRG9tYWluKHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXgsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBVU0VSIFBPT0wgQ0xJRU5UXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFVzZXIgUG9vbCBDbGllbnQgKGZvciBmcm9udGVuZCBhcHApXG4gICAgdGhpcy51c2VyUG9vbENsaWVudCA9IHRoaXMudXNlclBvb2wuYWRkQ2xpZW50KCdQZGZDb252ZXJzYXRpb25XZWJDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi13ZWItY2xpZW50YCxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuR09PR0xFLFxuICAgICAgXSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwL2NhbGxiYWNrJyxcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwLycsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9sb2dpbicsXG4gICAgICAgICAgLi4uKHByb3BzLmNsb3VkRnJvbnREb21haW4gPyBbXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmNsb3VkRnJvbnREb21haW59L2NhbGxiYWNrYCxcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY2xvdWRGcm9udERvbWFpbn0vYCxcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY2xvdWRGcm9udERvbWFpbn0vbG9naW5gLFxuICAgICAgICAgIF0gOiBbXSksXG4gICAgICAgICAgLi4uKHByb3BzLmN1c3RvbURvbWFpbk5hbWUgPyBbXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmN1c3RvbURvbWFpbk5hbWV9L2NhbGxiYWNrYCxcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY3VzdG9tRG9tYWluTmFtZX0vYCxcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY3VzdG9tRG9tYWluTmFtZX0vbG9naW5gLFxuICAgICAgICAgIF0gOiBbXSksXG4gICAgICAgIF0sXG4gICAgICAgIGxvZ291dFVybHM6IFtcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwLycsXG4gICAgICAgICAgLi4uKHByb3BzLmNsb3VkRnJvbnREb21haW4gPyBbXG4gICAgICAgICAgICBgaHR0cHM6Ly8ke3Byb3BzLmNsb3VkRnJvbnREb21haW59L2AsXG4gICAgICAgICAgXSA6IFtdKSxcbiAgICAgICAgICAuLi4ocHJvcHMuY3VzdG9tRG9tYWluTmFtZSA/IFtcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY3VzdG9tRG9tYWluTmFtZX0vYCxcbiAgICAgICAgICBdIDogW10pLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLFxuICAgICAgYWNjZXNzVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgICAgaWRUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgICByZWZyZXNoVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgcmVhZEF0dHJpYnV0ZXM6IG5ldyBjb2duaXRvLkNsaWVudEF0dHJpYnV0ZXMoKVxuICAgICAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyh7IGVtYWlsOiB0cnVlLCBnaXZlbk5hbWU6IHRydWUsIGZhbWlseU5hbWU6IHRydWUsIGZ1bGxuYW1lOiB0cnVlIH0pXG4gICAgICAgIC53aXRoQ3VzdG9tQXR0cmlidXRlcygnb3JnYW5pemF0aW9uJywgJ3JvbGUnKSxcbiAgICB9KTtcblxuICAgIHRoaXMudXNlclBvb2xDbGllbnQubm9kZS5hZGREZXBlbmRlbmN5KGdvb2dsZUlkUCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENPR05JVE8gSURFTlRJVFkgUE9PTCAoZm9yIFMzIGRpcmVjdCB1cGxvYWQpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIHRoaXMuaWRlbnRpdHlQb29sID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sKHRoaXMsICdQZGZDb252ZXJzYXRpb25JZGVudGl0eVBvb2wnLCB7XG4gICAgICBpZGVudGl0eVBvb2xOYW1lOiBgJHtwLnJlcGxhY2UoLy0vZywgJ18nKX1wZGZfY29udmVyc2F0aW9uX2lkZW50aXR5X3Bvb2xgLFxuICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICB7XG4gICAgICAgICAgY2xpZW50SWQ6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICBwcm92aWRlck5hbWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gSUFNIFJvbGUgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnNcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29nbml0b0F1dGhlbnRpY2F0ZWRSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3B9UGRmQ29udmVyc2F0aW9uLUNvZ25pdG9BdXRoUm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJyxcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWQnOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgICAgfSxcbiAgICAgICAgICAnRm9yQW55VmFsdWU6U3RyaW5nTGlrZSc6IHtcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yJzogJ2F1dGhlbnRpY2F0ZWQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgICdzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eSdcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBhdXRoZW50aWNhdGVkIHVzZXJzIHRvIHVwbG9hZCB0byB0aGVpciBvd24gZm9sZGVyIGluIFMzXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgJHtwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmJ1Y2tldEFybn0vdXNlcnMvXFwke2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTpzdWJ9LypgLFxuICAgICAgXSxcbiAgICB9KSk7XG5cbiAgICAvLyBBbGxvdyBhdXRoZW50aWNhdGVkIHVzZXJzIHRvIGxpc3QgdGhlaXIgb3duIGZvbGRlclxuICAgIGF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW3Byb3BzLnByb2Nlc3NpbmdCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgICdzMzpwcmVmaXgnOiBbJ3VzZXJzLyR7Y29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOnN1Yn0vKiddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KSk7XG5cbiAgICAvLyBBdHRhY2ggcm9sZSB0byBpZGVudGl0eSBwb29sXG4gICAgbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQodGhpcywgJ0lkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50Jywge1xuICAgICAgaWRlbnRpdHlQb29sSWQ6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgIHJvbGVzOiB7XG4gICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBBUEkgR0FURVdBWVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1BkZkNvbnZlcnNhdGlvbkFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiAnUERGIENvbnZlcnNhdGlvbiBBUEknLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIFBERiBDb252ZXJzYXRpb24gU3lzdGVtJyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiAndjEnLFxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogMTAwLFxuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiA1MCxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgICAgLi4uKHByb3BzLmNsb3VkRnJvbnREb21haW4gPyBbYGh0dHBzOi8vJHtwcm9wcy5jbG91ZEZyb250RG9tYWlufWBdIDogW10pLFxuICAgICAgICAgIC4uLihwcm9wcy5jdXN0b21Eb21haW5OYW1lID8gW2BodHRwczovLyR7cHJvcHMuY3VzdG9tRG9tYWluTmFtZX1gXSA6IFtdKSxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxuICAgICAgICAgICdYLUFtei1EYXRlJyxcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ1gtQXBpLUtleScsXG4gICAgICAgICAgJ1gtQW16LVNlY3VyaXR5LVRva2VuJyxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIEF1dGhvcml6ZXJcbiAgICBjb25zdCBhdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NvZ25pdG9BdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3RoaXMudXNlclBvb2xdLFxuICAgICAgYXV0aG9yaXplck5hbWU6ICdDb2duaXRvQXV0aG9yaXplcicsXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQVBJIEVORFBPSU5UU1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBRdWVyeSBlbmRwb2ludCAtIFBPU1QgL3F1ZXJ5XG4gICAgY29uc3QgcXVlcnlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3F1ZXJ5Jyk7XG4gICAgcXVlcnlSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5xdWVyeVByb2Nlc3NpbmdGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gRG9jdW1lbnRzIGVuZHBvaW50IC0gR0VUIC9kb2N1bWVudHMgKGxpc3QgdXNlcidzIGRvY3VtZW50cylcbiAgICBjb25zdCBkb2N1bWVudHNSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2RvY3VtZW50cycpO1xuXG4gICAgLy8gTGFtYmRhIGZvciBsaXN0aW5nIGRvY3VtZW50c1xuICAgIGNvbnN0IGxpc3REb2N1bWVudHNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0xpc3REb2N1bWVudHNGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1MaXN0RG9jdW1lbnRzYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgb3NcbmZyb20gYm90bzMuZHluYW1vZGIuY29uZGl0aW9ucyBpbXBvcnQgS2V5XG5cbmR5bmFtb2RiID0gYm90bzMucmVzb3VyY2UoJ2R5bmFtb2RiJylcbnRhYmxlID0gZHluYW1vZGIuVGFibGUob3MuZW52aXJvblsnTUVUQURBVEFfVEFCTEUnXSlcblxuQUxMT1dFRF9PUklHSU5TID0gb3MuZW52aXJvbi5nZXQoJ0FMTE9XRURfT1JJR0lOUycsICdodHRwOi8vbG9jYWxob3N0OjMwMDAnKS5zcGxpdCgnLCcpXG5cbmRlZiBnZXRfY29yc19vcmlnaW4oZXZlbnQpOlxuICAgIG9yaWdpbiA9IChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdvcmlnaW4nKSBvciAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnT3JpZ2luJywgJycpXG4gICAgcmV0dXJuIG9yaWdpbiBpZiBvcmlnaW4gaW4gQUxMT1dFRF9PUklHSU5TIGVsc2UgQUxMT1dFRF9PUklHSU5TWzBdXG5cbmRlZiBjb3JzX2hlYWRlcnMoZXZlbnQpOlxuICAgIHJldHVybiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBnZXRfY29yc19vcmlnaW4oZXZlbnQpLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiAndHJ1ZSdcbiAgICB9XG5cbmRlZiBsYW1iZGFfaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgcHJpbnQoZlwiRXZlbnQ6IHtqc29uLmR1bXBzKGV2ZW50KX1cIilcblxuICAgICMgR2V0IHVzZXJfaWQgZnJvbSBDb2duaXRvIGNsYWltc1xuICAgIGNsYWltcyA9IGV2ZW50LmdldCgncmVxdWVzdENvbnRleHQnLCB7fSkuZ2V0KCdhdXRob3JpemVyJywge30pLmdldCgnY2xhaW1zJywge30pXG4gICAgdXNlcl9pZCA9IGNsYWltcy5nZXQoJ3N1YicsICcnKVxuXG4gICAgaWYgbm90IHVzZXJfaWQ6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwMSxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ1VuYXV0aG9yaXplZCd9KVxuICAgICAgICB9XG5cbiAgICB0cnk6XG4gICAgICAgICMgUXVlcnkgZG9jdW1lbnRzIGZvciB0aGlzIHVzZXJcbiAgICAgICAgcmVzcG9uc2UgPSB0YWJsZS5zY2FuKFxuICAgICAgICAgICAgRmlsdGVyRXhwcmVzc2lvbj1LZXkoJ3VzZXJfaWQnKS5lcSh1c2VyX2lkKVxuICAgICAgICApXG5cbiAgICAgICAgZG9jdW1lbnRzID0gW3tcbiAgICAgICAgICAgICdkb2N1bWVudF9pZCc6IGl0ZW1bJ2RvY3VtZW50X2lkJ10sXG4gICAgICAgICAgICAnZmlsZW5hbWUnOiBpdGVtLmdldCgnb3JpZ2luYWxfZmlsZW5hbWUnLCAnVW5rbm93bicpLFxuICAgICAgICAgICAgJ3N0YXR1cyc6IGl0ZW0uZ2V0KCdzdGF0dXMnLCAndW5rbm93bicpLFxuICAgICAgICAgICAgJ2NyZWF0ZWRfYXQnOiBpdGVtLmdldCgnY3JlYXRlZF9hdCcsICcnKSxcbiAgICAgICAgICAgICd2ZWN0b3JfY291bnQnOiBpbnQoaXRlbS5nZXQoJ3ZlY3Rvcl9jb3VudCcsIDApKSBpZiBpdGVtLmdldCgndmVjdG9yX2NvdW50JykgZWxzZSAwXG4gICAgICAgIH0gZm9yIGl0ZW0gaW4gcmVzcG9uc2UuZ2V0KCdJdGVtcycsIFtdKV1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiAyMDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoe1xuICAgICAgICAgICAgICAgICdkb2N1bWVudHMnOiBkb2N1bWVudHMsXG4gICAgICAgICAgICAgICAgJ2NvdW50JzogbGVuKGRvY3VtZW50cylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIHByaW50KGZcIkVycm9yOiB7c3RyKGUpfVwiKVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA1MDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6IHN0cihlKX0pXG4gICAgICAgIH1cbmApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHByb3BzLm1ldGFkYXRhVGFibGVOYW1lLFxuICAgICAgICBBTExPV0VEX09SSUdJTlM6IGFsbG93ZWRPcmlnaW5zLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHJlYWQgYWNjZXNzXG4gICAgbGlzdERvY3VtZW50c0Z1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpTY2FuJyxcbiAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvJHtwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZX1gXSxcbiAgICB9KSk7XG5cbiAgICBkb2N1bWVudHNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxpc3REb2N1bWVudHNGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gVXBsb2FkIHByZXNpZ25lZCBVUkwgZW5kcG9pbnQgLSBQT1NUIC91cGxvYWQvcHJlc2lnbmVkXG4gICAgY29uc3QgdXBsb2FkUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCd1cGxvYWQnKTtcbiAgICBjb25zdCBwcmVzaWduZWRSZXNvdXJjZSA9IHVwbG9hZFJlc291cmNlLmFkZFJlc291cmNlKCdwcmVzaWduZWQnKTtcblxuICAgIGNvbnN0IHByZXNpZ25lZFVybEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUHJlc2lnbmVkVXJsRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3B9R2VuZXJhdGVQcmVzaWduZWRVcmxgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCBvc1xuaW1wb3J0IHJlXG5pbXBvcnQgdXVpZFxuZnJvbSBkYXRldGltZSBpbXBvcnQgZGF0ZXRpbWVcblxuczNfY2xpZW50ID0gYm90bzMuY2xpZW50KCdzMycpXG5keW5hbW9kYiA9IGJvdG8zLnJlc291cmNlKCdkeW5hbW9kYicpXG5CVUNLRVRfTkFNRSA9IG9zLmVudmlyb25bJ0JVQ0tFVF9OQU1FJ11cbk1FVEFEQVRBX1RBQkxFID0gb3MuZW52aXJvblsnTUVUQURBVEFfVEFCTEUnXVxuXG5BTExPV0VEX09SSUdJTlMgPSBvcy5lbnZpcm9uLmdldCgnQUxMT1dFRF9PUklHSU5TJywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcpLnNwbGl0KCcsJylcblxuZGVmIGdldF9jb3JzX29yaWdpbihldmVudCk6XG4gICAgb3JpZ2luID0gKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ29yaWdpbicpIG9yIChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdPcmlnaW4nLCAnJylcbiAgICByZXR1cm4gb3JpZ2luIGlmIG9yaWdpbiBpbiBBTExPV0VEX09SSUdJTlMgZWxzZSBBTExPV0VEX09SSUdJTlNbMF1cblxuZGVmIGNvcnNfaGVhZGVycyhldmVudCk6XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IGdldF9jb3JzX29yaWdpbihldmVudCksXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6ICd0cnVlJ1xuICAgIH1cblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICBwcmludChmXCJFdmVudDoge2pzb24uZHVtcHMoZXZlbnQpfVwiKVxuXG4gICAgY2xhaW1zID0gZXZlbnQuZ2V0KCdyZXF1ZXN0Q29udGV4dCcsIHt9KS5nZXQoJ2F1dGhvcml6ZXInLCB7fSkuZ2V0KCdjbGFpbXMnLCB7fSlcbiAgICB1c2VyX2lkID0gY2xhaW1zLmdldCgnc3ViJywgJycpXG5cbiAgICBpZiBub3QgdXNlcl9pZDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAxLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnVW5hdXRob3JpemVkJ30pXG4gICAgICAgIH1cblxuICAgIHRyeTpcbiAgICAgICAgYm9keSA9IGpzb24ubG9hZHMoZXZlbnQuZ2V0KCdib2R5JywgJ3t9JykpXG4gICAgICAgIG9yaWdpbmFsX2ZpbGVuYW1lID0gYm9keS5nZXQoJ2ZpbGVuYW1lJywgJ2RvY3VtZW50LnBkZicpXG4gICAgICAgIG9yaWdpbmFsX2ZpbGVuYW1lID0gcmUuc3ViKHInWy9cXFxcXFxcXDw+OlwifD8qXFxcXHgwMC1cXFxceDFmXScsICdfJywgb3JpZ2luYWxfZmlsZW5hbWUpXG4gICAgICAgIGlmIGxlbihvcmlnaW5hbF9maWxlbmFtZSkgPiAyNTU6XG4gICAgICAgICAgICBvcmlnaW5hbF9maWxlbmFtZSA9IG9yaWdpbmFsX2ZpbGVuYW1lWzoyNTVdXG4gICAgICAgIGNvbnRlbnRfdHlwZSA9IGJvZHkuZ2V0KCdjb250ZW50X3R5cGUnLCAnYXBwbGljYXRpb24vcGRmJylcblxuICAgICAgICBkb2N1bWVudF9pZCA9IHN0cih1dWlkLnV1aWQ0KCkpXG4gICAgICAgIHMzX2tleSA9IGZcInVzZXJzL3t1c2VyX2lkfS97ZG9jdW1lbnRfaWR9LnBkZlwiXG5cbiAgICAgICAgdGFibGUgPSBkeW5hbW9kYi5UYWJsZShNRVRBREFUQV9UQUJMRSlcbiAgICAgICAgdGFibGUucHV0X2l0ZW0oSXRlbT17XG4gICAgICAgICAgICAnZG9jdW1lbnRfaWQnOiBkb2N1bWVudF9pZCxcbiAgICAgICAgICAgICd1c2VyX2lkJzogdXNlcl9pZCxcbiAgICAgICAgICAgICdvcmlnaW5hbF9maWxlbmFtZSc6IG9yaWdpbmFsX2ZpbGVuYW1lLFxuICAgICAgICAgICAgJ29yaWdpbmFsX3MzX2xvY2F0aW9uJzogeydidWNrZXQnOiBCVUNLRVRfTkFNRSwgJ2tleSc6IHMzX2tleX0sXG4gICAgICAgICAgICAnc3RhdHVzJzogJ3VwbG9hZGluZycsXG4gICAgICAgICAgICAnY3JlYXRlZF9hdCc6IGRhdGV0aW1lLnV0Y25vdygpLmlzb2Zvcm1hdCgpLFxuICAgICAgICAgICAgJ3Byb2Nlc3NpbmdfbWV0YWRhdGEnOiB7fVxuICAgICAgICB9KVxuXG4gICAgICAgIHByZXNpZ25lZF91cmwgPSBzM19jbGllbnQuZ2VuZXJhdGVfcHJlc2lnbmVkX3VybChcbiAgICAgICAgICAgICdwdXRfb2JqZWN0JyxcbiAgICAgICAgICAgIFBhcmFtcz17XG4gICAgICAgICAgICAgICAgJ0J1Y2tldCc6IEJVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgICAgICdLZXknOiBzM19rZXksXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnRUeXBlJzogY29udGVudF90eXBlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEV4cGlyZXNJbj0zNjAwXG4gICAgICAgIClcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiAyMDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoe1xuICAgICAgICAgICAgICAgICdwcmVzaWduZWRfdXJsJzogcHJlc2lnbmVkX3VybCxcbiAgICAgICAgICAgICAgICAnZG9jdW1lbnRfaWQnOiBkb2N1bWVudF9pZCxcbiAgICAgICAgICAgICAgICAnZXhwaXJlc19pbic6IDM2MDBcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIHByaW50KGZcIkVycm9yOiB7c3RyKGUpfVwiKVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA1MDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdGYWlsZWQgdG8gZ2VuZXJhdGUgdXBsb2FkIFVSTCd9KVxuICAgICAgICB9XG5gKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEJVQ0tFVF9OQU1FOiBwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIE1FVEFEQVRBX1RBQkxFOiBwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZSxcbiAgICAgICAgQUxMT1dFRF9PUklHSU5TOiBhbGxvd2VkT3JpZ2lucyxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBTMyBwZXJtaXNzaW9ucyBmb3IgcHJlc2lnbmVkIFVSTHNcbiAgICBwcmVzaWduZWRVcmxGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydzMzpQdXRPYmplY3QnXSxcbiAgICAgIHJlc291cmNlczogW2Ake3Byb3BzLnByb2Nlc3NpbmdCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgfSkpO1xuXG4gICAgcHJlc2lnbmVkVXJsRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnZHluYW1vZGI6UHV0SXRlbSddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlLyR7cHJvcHMubWV0YWRhdGFUYWJsZU5hbWV9YF0sXG4gICAgfSkpO1xuXG4gICAgcHJlc2lnbmVkUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJlc2lnbmVkVXJsRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGdldERvY3VtZW50U3VtbWFyeUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnR2V0RG9jdW1lbnRTdW1tYXJ5RnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3B9R2V0RG9jdW1lbnRTdW1tYXJ5YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgb3NcbmZyb20gZGVjaW1hbCBpbXBvcnQgRGVjaW1hbFxuXG5keW5hbW9kYiA9IGJvdG8zLnJlc291cmNlKCdkeW5hbW9kYicpXG50YWJsZSA9IGR5bmFtb2RiLlRhYmxlKG9zLmVudmlyb25bJ01FVEFEQVRBX1RBQkxFJ10pXG5cbkFMTE9XRURfT1JJR0lOUyA9IG9zLmVudmlyb24uZ2V0KCdBTExPV0VEX09SSUdJTlMnLCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJykuc3BsaXQoJywnKVxuXG5kZWYgZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KTpcbiAgICBvcmlnaW4gPSAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnb3JpZ2luJykgb3IgKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ09yaWdpbicsICcnKVxuICAgIHJldHVybiBvcmlnaW4gaWYgb3JpZ2luIGluIEFMTE9XRURfT1JJR0lOUyBlbHNlIEFMTE9XRURfT1JJR0lOU1swXVxuXG5kZWYgY29yc19oZWFkZXJzKGV2ZW50KTpcbiAgICByZXR1cm4ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KSxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogJ3RydWUnXG4gICAgfVxuXG5kZWYgZGVjaW1hbF9kZWZhdWx0KG9iaik6XG4gICAgaWYgaXNpbnN0YW5jZShvYmosIERlY2ltYWwpOlxuICAgICAgICByZXR1cm4gaW50KG9iaikgaWYgb2JqICUgMSA9PSAwIGVsc2UgZmxvYXQob2JqKVxuICAgIHJhaXNlIFR5cGVFcnJvclxuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGNsYWltcyA9IGV2ZW50LmdldCgncmVxdWVzdENvbnRleHQnLCB7fSkuZ2V0KCdhdXRob3JpemVyJywge30pLmdldCgnY2xhaW1zJywge30pXG4gICAgdXNlcl9pZCA9IGNsYWltcy5nZXQoJ3N1YicsICcnKVxuXG4gICAgaWYgbm90IHVzZXJfaWQ6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwMSxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ1VuYXV0aG9yaXplZCd9KVxuICAgICAgICB9XG5cbiAgICBwYXRoX3BhcmFtcyA9IGV2ZW50LmdldCgncGF0aFBhcmFtZXRlcnMnKSBvciB7fVxuICAgIGRvY3VtZW50X2lkID0gcGF0aF9wYXJhbXMuZ2V0KCdpZCcsICcnKVxuXG4gICAgaWYgbm90IGRvY3VtZW50X2lkOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA0MDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdNaXNzaW5nIGRvY3VtZW50IElEJ30pXG4gICAgICAgIH1cblxuICAgIHRyeTpcbiAgICAgICAgcmVzcG9uc2UgPSB0YWJsZS5nZXRfaXRlbShLZXk9eydkb2N1bWVudF9pZCc6IGRvY3VtZW50X2lkfSlcblxuICAgICAgICBpZiAnSXRlbScgbm90IGluIHJlc3BvbnNlOlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwNCxcbiAgICAgICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnRG9jdW1lbnQgbm90IGZvdW5kJ30pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgaXRlbSA9IHJlc3BvbnNlWydJdGVtJ11cblxuICAgICAgICBpZiBpdGVtLmdldCgndXNlcl9pZCcsICcnKSAhPSB1c2VyX2lkOlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwNCxcbiAgICAgICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnRG9jdW1lbnQgbm90IGZvdW5kJ30pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0ID0ge1xuICAgICAgICAgICAgJ2RvY3VtZW50X2lkJzogaXRlbVsnZG9jdW1lbnRfaWQnXSxcbiAgICAgICAgICAgICdmaWxlbmFtZSc6IGl0ZW0uZ2V0KCdvcmlnaW5hbF9maWxlbmFtZScsICdVbmtub3duJyksXG4gICAgICAgICAgICAnc3RhdHVzJzogaXRlbS5nZXQoJ3N0YXR1cycsICd1bmtub3duJyksXG4gICAgICAgICAgICAnZ2VuZXJhdGVkX3N1bW1hcnknOiBpdGVtLmdldCgnZ2VuZXJhdGVkX3N1bW1hcnknKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgJ3N1bW1hcnlfZ2VuZXJhdGVkX2F0JyBpbiBpdGVtOlxuICAgICAgICAgICAgcmVzdWx0WydzdW1tYXJ5X2dlbmVyYXRlZF9hdCddID0gaXRlbVsnc3VtbWFyeV9nZW5lcmF0ZWRfYXQnXVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDIwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyhyZXN1bHQsIGRlZmF1bHQ9ZGVjaW1hbF9kZWZhdWx0KVxuICAgICAgICB9XG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBwcmludChmXCJFcnJvcjoge3N0cihlKX1cIilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiBzdHIoZSl9KVxuICAgICAgICB9XG5gKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE1FVEFEQVRBX1RBQkxFOiBwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZSxcbiAgICAgICAgQUxMT1dFRF9PUklHSU5TOiBhbGxvd2VkT3JpZ2lucyxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgfSk7XG5cbiAgICBnZXREb2N1bWVudFN1bW1hcnlGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydkeW5hbW9kYjpHZXRJdGVtJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvJHtwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZX1gXSxcbiAgICB9KSk7XG5cbiAgICBjb25zdCBkb2N1bWVudElkUmVzb3VyY2UgPSBkb2N1bWVudHNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2lkfScpO1xuICAgIGNvbnN0IHN1bW1hcnlSZXNvdXJjZSA9IGRvY3VtZW50SWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3VtbWFyeScpO1xuXG4gICAgc3VtbWFyeVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0RG9jdW1lbnRTdW1tYXJ5RnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbnNSZXNvdXJjZSA9IGRvY3VtZW50SWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnY29udmVyc2F0aW9ucycpO1xuICAgIGNvbnZlcnNhdGlvbnNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmNvbnZlcnNhdGlvbkZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgY29udmVyc2F0aW9uc1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmNvbnZlcnNhdGlvbkZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb252ZXJzYXRpb25JZFJlc291cmNlID0gY29udmVyc2F0aW9uc1Jlc291cmNlLmFkZFJlc291cmNlKCd7Y29udklkfScpO1xuICAgIGNvbnZlcnNhdGlvbklkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy5jb252ZXJzYXRpb25GdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gRGVsZXRlIGFjY291bnQgZW5kcG9pbnQgLSBERUxFVEUgL3VzZXJzL21lXG4gICAgY29uc3QgZGVsZXRlQWNjb3VudEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRGVsZXRlQWNjb3VudEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfURlbGV0ZUFjY291bnRgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCBvc1xuZnJvbSBib3RvMy5keW5hbW9kYi5jb25kaXRpb25zIGltcG9ydCBBdHRyXG5cbnMzX2NsaWVudCA9IGJvdG8zLmNsaWVudCgnczMnKVxuZHluYW1vZGIgPSBib3RvMy5yZXNvdXJjZSgnZHluYW1vZGInKVxuQlVDS0VUX05BTUUgPSBvcy5lbnZpcm9uWydCVUNLRVRfTkFNRSddXG5NRVRBREFUQV9UQUJMRSA9IG9zLmVudmlyb25bJ01FVEFEQVRBX1RBQkxFJ11cblxuQUxMT1dFRF9PUklHSU5TID0gb3MuZW52aXJvbi5nZXQoJ0FMTE9XRURfT1JJR0lOUycsICdodHRwOi8vbG9jYWxob3N0OjMwMDAnKS5zcGxpdCgnLCcpXG5cbmRlZiBnZXRfY29yc19vcmlnaW4oZXZlbnQpOlxuICAgIG9yaWdpbiA9IChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdvcmlnaW4nKSBvciAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnT3JpZ2luJywgJycpXG4gICAgcmV0dXJuIG9yaWdpbiBpZiBvcmlnaW4gaW4gQUxMT1dFRF9PUklHSU5TIGVsc2UgQUxMT1dFRF9PUklHSU5TWzBdXG5cbmRlZiBjb3JzX2hlYWRlcnMoZXZlbnQpOlxuICAgIHJldHVybiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBnZXRfY29yc19vcmlnaW4oZXZlbnQpLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiAndHJ1ZSdcbiAgICB9XG5cbmRlZiBsYW1iZGFfaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgY2xhaW1zID0gZXZlbnQuZ2V0KCdyZXF1ZXN0Q29udGV4dCcsIHt9KS5nZXQoJ2F1dGhvcml6ZXInLCB7fSkuZ2V0KCdjbGFpbXMnLCB7fSlcbiAgICB1c2VyX2lkID0gY2xhaW1zLmdldCgnc3ViJywgJycpXG5cbiAgICBpZiBub3QgdXNlcl9pZDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAxLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnVW5hdXRob3JpemVkJ30pXG4gICAgICAgIH1cblxuICAgIHRyeTpcbiAgICAgICAgdGFibGUgPSBkeW5hbW9kYi5UYWJsZShNRVRBREFUQV9UQUJMRSlcblxuICAgICAgICAjIFNjYW4gZm9yIGFsbCBkb2N1bWVudHMgYmVsb25naW5nIHRvIHRoaXMgdXNlclxuICAgICAgICByZXNwb25zZSA9IHRhYmxlLnNjYW4oRmlsdGVyRXhwcmVzc2lvbj1BdHRyKCd1c2VyX2lkJykuZXEodXNlcl9pZCkpXG4gICAgICAgIGl0ZW1zID0gcmVzcG9uc2UuZ2V0KCdJdGVtcycsIFtdKVxuICAgICAgICB3aGlsZSAnTGFzdEV2YWx1YXRlZEtleScgaW4gcmVzcG9uc2U6XG4gICAgICAgICAgICByZXNwb25zZSA9IHRhYmxlLnNjYW4oXG4gICAgICAgICAgICAgICAgRmlsdGVyRXhwcmVzc2lvbj1BdHRyKCd1c2VyX2lkJykuZXEodXNlcl9pZCksXG4gICAgICAgICAgICAgICAgRXhjbHVzaXZlU3RhcnRLZXk9cmVzcG9uc2VbJ0xhc3RFdmFsdWF0ZWRLZXknXVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgaXRlbXMuZXh0ZW5kKHJlc3BvbnNlLmdldCgnSXRlbXMnLCBbXSkpXG5cbiAgICAgICAgIyBEZWxldGUgZWFjaCB0cmFja2VkIFMzIG9iamVjdFxuICAgICAgICBmb3IgaXRlbSBpbiBpdGVtczpcbiAgICAgICAgICAgIHMzX2xvYyA9IGl0ZW0uZ2V0KCdvcmlnaW5hbF9zM19sb2NhdGlvbicsIHt9KVxuICAgICAgICAgICAga2V5ID0gczNfbG9jLmdldCgna2V5JywgJycpXG4gICAgICAgICAgICBpZiBrZXk6XG4gICAgICAgICAgICAgICAgczNfY2xpZW50LmRlbGV0ZV9vYmplY3QoQnVja2V0PUJVQ0tFVF9OQU1FLCBLZXk9a2V5KVxuXG4gICAgICAgICMgRGVsZXRlIGFueSBvcnBoYW5lZCBvYmplY3RzIHVuZGVyIHVzZXJzL3t1c2VyX2lkfS9cbiAgICAgICAgcGFnaW5hdG9yID0gczNfY2xpZW50LmdldF9wYWdpbmF0b3IoJ2xpc3Rfb2JqZWN0c192MicpXG4gICAgICAgIGZvciBwYWdlIGluIHBhZ2luYXRvci5wYWdpbmF0ZShCdWNrZXQ9QlVDS0VUX05BTUUsIFByZWZpeD1mJ3VzZXJzL3t1c2VyX2lkfS8nKTpcbiAgICAgICAgICAgIG9iamVjdHMgPSBbeydLZXknOiBvYmpbJ0tleSddfSBmb3Igb2JqIGluIHBhZ2UuZ2V0KCdDb250ZW50cycsIFtdKV1cbiAgICAgICAgICAgIGlmIG9iamVjdHM6XG4gICAgICAgICAgICAgICAgczNfY2xpZW50LmRlbGV0ZV9vYmplY3RzKEJ1Y2tldD1CVUNLRVRfTkFNRSwgRGVsZXRlPXsnT2JqZWN0cyc6IG9iamVjdHN9KVxuXG4gICAgICAgICMgQmF0Y2gtZGVsZXRlIER5bmFtb0RCIHJlY29yZHNcbiAgICAgICAgd2l0aCB0YWJsZS5iYXRjaF93cml0ZXIoKSBhcyBiYXRjaDpcbiAgICAgICAgICAgIGZvciBpdGVtIGluIGl0ZW1zOlxuICAgICAgICAgICAgICAgIGJhdGNoLmRlbGV0ZV9pdGVtKEtleT17J2RvY3VtZW50X2lkJzogaXRlbVsnZG9jdW1lbnRfaWQnXX0pXG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogMjAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnbWVzc2FnZSc6ICdBY2NvdW50IGRhdGEgZGVsZXRlZCd9KVxuICAgICAgICB9XG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBwcmludChmXCJFcnJvcjoge3N0cihlKX1cIilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiBzdHIoZSl9KVxuICAgICAgICB9XG5gKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEJVQ0tFVF9OQU1FOiBwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIE1FVEFEQVRBX1RBQkxFOiBwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZSxcbiAgICAgICAgQUxMT1dFRF9PUklHSU5TOiBhbGxvd2VkT3JpZ2lucyxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgfSk7XG5cbiAgICBkZWxldGVBY2NvdW50RnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnZHluYW1vZGI6U2NhbicsICdkeW5hbW9kYjpEZWxldGVJdGVtJywgJ2R5bmFtb2RiOkJhdGNoV3JpdGVJdGVtJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvJHtwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZX1gXSxcbiAgICB9KSk7XG5cbiAgICBkZWxldGVBY2NvdW50RnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnczM6RGVsZXRlT2JqZWN0JywgJ3MzOkxpc3RCdWNrZXQnXSxcbiAgICAgIHJlc291cmNlczogW3Byb3BzLnByb2Nlc3NpbmdCdWNrZXQuYnVja2V0QXJuLCBgJHtwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgIH0pKTtcblxuICAgIGNvbnN0IHVzZXJzUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGNvbnN0IG1lUmVzb3VyY2UgPSB1c2Vyc1Jlc291cmNlLmFkZFJlc291cmNlKCdtZScpO1xuICAgIG1lUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihkZWxldGVBY2NvdW50RnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzYWdlUmVzb3VyY2UgPSBtZVJlc291cmNlLmFkZFJlc291cmNlKCd1c2FnZScpO1xuICAgIHVzYWdlUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9wcy51c2FnZUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIE9VVFBVVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwfVBkZkNvbnZlcnNhdGlvbi1Vc2VyUG9vbElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9UGRmQ29udmVyc2F0aW9uLVVzZXJQb29sQ2xpZW50SWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0lkZW50aXR5UG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBJZGVudGl0eSBQb29sIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9UGRmQ29udmVyc2F0aW9uLUlkZW50aXR5UG9vbElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IEVuZHBvaW50IFVSTCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwfVBkZkNvbnZlcnNhdGlvbi1BcGlFbmRwb2ludGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1JlZ2lvbicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnJlZ2lvbixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIFJlZ2lvbiBmb3IgQ29nbml0bycsXG4gICAgICBleHBvcnROYW1lOiBgJHtwfVBkZkNvbnZlcnNhdGlvbi1Db2duaXRvUmVnaW9uYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbERvbWFpbk91dHB1dCcsIHtcbiAgICAgIHZhbHVlOiBgJHtkb21haW5QcmVmaXh9LmF1dGguJHt0aGlzLnJlZ2lvbn0uYW1hem9uY29nbml0by5jb21gLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1QZGZDb252ZXJzYXRpb24tVXNlclBvb2xEb21haW5gLFxuICAgIH0pO1xuICB9XG59XG4iXX0=
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
            resources: [`arn:aws:cognito-idp:${props.envConfig.region}:${this.account}:userpool/*`],
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

    def _extract_title(item):
        try:
            gs = item.get('generated_summary')
            if not gs:
                return None
            if isinstance(gs, str):
                gs = json.loads(gs)
            return gs.get('title')
        except Exception:
            return None

    try:
        response = table.scan(
            FilterExpression=Key('user_id').eq(user_id),
            ProjectionExpression='document_id, original_filename, #s, created_at, vector_count, generated_summary',
            ExpressionAttributeNames={'#s': 'status'}
        )

        documents = [{
            'document_id': item['document_id'],
            'filename': item.get('original_filename', 'Unknown'),
            'status': item.get('status', 'unknown'),
            'created_at': item.get('created_at', ''),
            'vector_count': int(item.get('vector_count', 0)) if item.get('vector_count') else 0,
            'title': _extract_title(item)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1hdXRoLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGRmLWNvbnZlcnNhdGlvbi1hdXRoLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLGlFQUFtRDtBQUNuRCx1RUFBeUQ7QUFDekQsK0RBQWlEO0FBQ2pELHlEQUEyQztBQWdCM0MsTUFBYSx3QkFBeUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNyQyxRQUFRLENBQW1CO0lBQzNCLGNBQWMsQ0FBeUI7SUFDdkMsR0FBRyxDQUFxQjtJQUN4QixZQUFZLENBQTBCO0lBRXRELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFFakMsTUFBTSxlQUFlLEdBQTJCO1lBQzlDLElBQUksRUFBRSxPQUFPO1lBQ2IsT0FBTyxFQUFFLGVBQWU7WUFDeEIsR0FBRyxFQUFFLFdBQVc7U0FDakIsQ0FBQztRQUNGLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU5RixNQUFNLGNBQWMsR0FBRztZQUNyQix1QkFBdUI7WUFDdkIsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN4RSxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENB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RyxDQUFDLGdDQUFnQztTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ25CLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLEdBQUcsQ0FBQyw2QkFBNkI7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ2xCLFdBQVcsRUFBRSx3QkFBd0I7WUFDckMsVUFBVSxFQUFFLEdBQUcsQ0FBQywrQkFBK0I7U0FDaEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsR0FBRyxZQUFZLFNBQVMsSUFBSSxDQUFDLE1BQU0sb0JBQW9CO1lBQzlELFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxnQ0FBZ0M7U0FDakQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcDhCRCw0REFvOEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBQZGZDb252ZXJzYXRpb25BdXRoU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgcmVhZG9ubHkgcXVlcnlQcm9jZXNzaW5nRnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IGRvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IHByb2Nlc3NpbmdCdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIHJlYWRvbmx5IG1ldGFkYXRhVGFibGVOYW1lOiBzdHJpbmc7XG4gIHJlYWRvbmx5IGNvbnZlcnNhdGlvbkZ1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSB1c2FnZUZ1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSBjbG91ZEZyb250RG9tYWluPzogc3RyaW5nO1xuICByZWFkb25seSBjdXN0b21Eb21haW5OYW1lPzogc3RyaW5nO1xuICByZWFkb25seSBlbnZDb25maWc6IEVudmlyb25tZW50Q29uZmlnO1xufVxuXG5leHBvcnQgY2xhc3MgUGRmQ29udmVyc2F0aW9uQXV0aFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGlkZW50aXR5UG9vbDogY29nbml0by5DZm5JZGVudGl0eVBvb2w7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFBkZkNvbnZlcnNhdGlvbkF1dGhTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBwID0gcHJvcHMuZW52Q29uZmlnLnByZWZpeDtcblxuICAgIGNvbnN0IGRvbWFpblByZWZpeE1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgIHByb2Q6ICdmb2xpbycsXG4gICAgICBzdGFnaW5nOiAnZm9saW8tc3RhZ2luZycsXG4gICAgICBkZXY6ICdmb2xpby1kZXYnLFxuICAgIH07XG4gICAgY29uc3QgZG9tYWluUHJlZml4ID0gZG9tYWluUHJlZml4TWFwW3Byb3BzLmVudkNvbmZpZy5uYW1lXSA/PyBgZm9saW8tJHtwcm9wcy5lbnZDb25maWcubmFtZX1gO1xuXG4gICAgY29uc3QgYWxsb3dlZE9yaWdpbnMgPSBbXG4gICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgIC4uLihwcm9wcy5jbG91ZEZyb250RG9tYWluID8gW2BodHRwczovLyR7cHJvcHMuY2xvdWRGcm9udERvbWFpbn1gXSA6IFtdKSxcbiAgICAgIC4uLihwcm9wcy5jdXN0b21Eb21haW5OYW1lID8gW2BodHRwczovLyR7cHJvcHMuY3VzdG9tRG9tYWluTmFtZX1gXSA6IFtdKSxcbiAgICBdLmpvaW4oJywnKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ09HTklUTyBMQU1CREEgVFJJR0dFUlNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgY29uc3QgY3VzdG9tTWVzc2FnZUZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ3VzdG9tTWVzc2FnZUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfUN1c3RvbU1lc3NhZ2VUcmlnZ2VyYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5cbkhUTUxfVEVNUExBVEUgPSBcIlwiXCI8IURPQ1RZUEUgaHRtbD5cbjxodG1sIGxhbmc9XCJlblwiPlxuPGhlYWQ+PG1ldGEgY2hhcnNldD1cIlVURi04XCI+PG1ldGEgbmFtZT1cInZpZXdwb3J0XCIgY29udGVudD1cIndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTFcIj48L2hlYWQ+XG48Ym9keSBzdHlsZT1cIm1hcmdpbjowO3BhZGRpbmc6MDtiYWNrZ3JvdW5kOiMwQzBEMTA7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtcIj5cbjx0YWJsZSB3aWR0aD1cIjEwMCVcIiBjZWxscGFkZGluZz1cIjBcIiBjZWxsc3BhY2luZz1cIjBcIiBib3JkZXI9XCIwXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiMwQzBEMTA7bWluLWhlaWdodDoxMDB2aDtcIj5cbiAgPHRyPlxuICAgIDx0ZCBhbGlnbj1cImNlbnRlclwiIHN0eWxlPVwicGFkZGluZzo0MHB4IDE2cHg7XCI+XG4gICAgICA8dGFibGUgd2lkdGg9XCI2MDBcIiBjZWxscGFkZGluZz1cIjBcIiBjZWxsc3BhY2luZz1cIjBcIiBib3JkZXI9XCIwXCIgc3R5bGU9XCJtYXgtd2lkdGg6NjAwcHg7d2lkdGg6MTAwJTtcIj5cbiAgICAgICAgPHRyPlxuICAgICAgICAgIDx0ZCBhbGlnbj1cImNlbnRlclwiIHN0eWxlPVwicGFkZGluZzozMnB4IDAgMjRweDtcIj5cbiAgICAgICAgICAgIDxzdmcgd2lkdGg9XCIyOFwiIGhlaWdodD1cIjI4XCIgdmlld0JveD1cIjAgMCAyOCAyOFwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBzdHlsZT1cImRpc3BsYXk6aW5saW5lLWJsb2NrO3ZlcnRpY2FsLWFsaWduOm1pZGRsZTttYXJnaW4tcmlnaHQ6MTBweDtcIj5cbiAgICAgICAgICAgICAgPHBvbHlnb24gcG9pbnRzPVwiMTQsMSAyNywxNCAxNCwyNyAxLDE0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCIjRjU2NTY1XCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIvPlxuICAgICAgICAgICAgICA8cG9seWdvbiBwb2ludHM9XCIxNCw2IDIyLDE0IDE0LDIyIDYsMTRcIiBmaWxsPVwiI0Y1NjU2NVwiIG9wYWNpdHk9XCIwLjE1XCIvPlxuICAgICAgICAgICAgICA8bGluZSB4MT1cIjE0XCIgeTE9XCIxXCIgeDI9XCIxNFwiIHkyPVwiMjdcIiBzdHJva2U9XCIjRjU2NTY1XCIgb3BhY2l0eT1cIjAuNFwiLz5cbiAgICAgICAgICAgIDwvc3ZnPlxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LWZhbWlseTonQ291cmllciBOZXcnLG1vbm9zcGFjZTtmb250LXdlaWdodDpib2xkO2ZvbnQtc2l6ZToxOHB4O2xldHRlci1zcGFjaW5nOjNweDtjb2xvcjojRThFQ0YwO3ZlcnRpY2FsLWFsaWduOm1pZGRsZTtcIj5GT0xJTzwvc3Bhbj5cbiAgICAgICAgICA8L3RkPlxuICAgICAgICA8L3RyPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRkIHN0eWxlPVwiYmFja2dyb3VuZDojMTUxNzIwO2JvcmRlcjoxcHggc29saWQgIzJBMkQzQTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjMycHg7XCI+XG4gICAgICAgICAgICA8aDEgc3R5bGU9XCJtYXJnaW46MCAwIDE2cHg7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MjBweDtmb250LXdlaWdodDo2MDA7Y29sb3I6I0U4RUNGMDtsaW5lLWhlaWdodDoxLjM7XCI+VmVyaWZ5IHlvdXIgRm9saW8gYWNjb3VudC48L2gxPlxuICAgICAgICAgICAgPHAgc3R5bGU9XCJtYXJnaW46MCAwIDI0cHg7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MTRweDtjb2xvcjojQzRDOUQ0O2xpbmUtaGVpZ2h0OjEuNjtcIj5Vc2UgdGhlIGNvZGUgYmVsb3cgdG8gY29tcGxldGUgeW91ciBzaWduLXVwLiBJdCBleHBpcmVzIGluIDI0IGhvdXJzLjwvcD5cbiAgICAgICAgICAgIDx0YWJsZSB3aWR0aD1cIjEwMCVcIiBjZWxscGFkZGluZz1cIjBcIiBjZWxsc3BhY2luZz1cIjBcIiBib3JkZXI9XCIwXCI+XG4gICAgICAgICAgICAgIDx0cj5cbiAgICAgICAgICAgICAgICA8dGQgYWxpZ249XCJjZW50ZXJcIiBzdHlsZT1cImJhY2tncm91bmQ6IzFDMUYyQjtib3JkZXI6MnB4IHNvbGlkICNGNTY1NjU7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoyNHB4O1wiPlxuICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LWZhbWlseTonQ291cmllciBOZXcnLG1vbm9zcGFjZTtmb250LXNpemU6MzJweDtmb250LXdlaWdodDpib2xkO2NvbG9yOiNGNTY1NjU7bGV0dGVyLXNwYWNpbmc6MC4yZW07XCI+e2NvZGV9PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgICAgICAgIDwvdHI+XG4gICAgICAgICAgICA8L3RhYmxlPlxuICAgICAgICAgICAgPHAgc3R5bGU9XCJtYXJnaW46MjRweCAwIDA7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MTJweDtjb2xvcjojNTU1QjZFO2xpbmUtaGVpZ2h0OjEuNTtcIj5JZiB5b3UgZGlkbiYjMzk7dCBjcmVhdGUgYSBGb2xpbyBhY2NvdW50LCBpZ25vcmUgdGhpcyBlbWFpbC48L3A+XG4gICAgICAgICAgPC90ZD5cbiAgICAgICAgPC90cj5cbiAgICAgICAgPHRyPlxuICAgICAgICAgIDx0ZCBhbGlnbj1cImNlbnRlclwiIHN0eWxlPVwicGFkZGluZzoyMHB4IDAgMDtcIj5cbiAgICAgICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjA7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6MTFweDtjb2xvcjojNTU1QjZFO1wiPmZvbGlvLnp1a29uYXJ5YS5jb20gJm1pZGRvdDsgWnVrb05hcnlhPC9wPlxuICAgICAgICAgIDwvdGQ+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3RhYmxlPlxuICAgIDwvdGQ+XG4gIDwvdHI+XG48L3RhYmxlPlxuPC9ib2R5PlxuPC9odG1sPlwiXCJcIlxuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGlmIGV2ZW50LmdldCgndHJpZ2dlclNvdXJjZScpID09ICdDdXN0b21NZXNzYWdlX1NpZ25VcCc6XG4gICAgICAgIGNvZGUgPSBldmVudFsncmVxdWVzdCddLmdldCgnY29kZVBhcmFtZXRlcicsICd7IyMjI30nKVxuICAgICAgICBldmVudFsncmVzcG9uc2UnXVsnZW1haWxTdWJqZWN0J10gPSAnVmVyaWZ5IHlvdXIgRm9saW8gYWNjb3VudCdcbiAgICAgICAgZXZlbnRbJ3Jlc3BvbnNlJ11bJ2VtYWlsTWVzc2FnZSddID0gSFRNTF9URU1QTEFURS5yZXBsYWNlKCd7Y29kZX0nLCBjb2RlKVxuICAgIHJldHVybiBldmVudFxuYCksXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmVTaWduVXBGbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1ByZVNpZ25VcEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfVByZVNpZ25VcFRyaWdnZXJgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IGxvZ2dpbmdcblxubG9nZ2VyID0gbG9nZ2luZy5nZXRMb2dnZXIoKVxubG9nZ2VyLnNldExldmVsKGxvZ2dpbmcuSU5GTylcblxuY29nbml0b19jbGllbnQgPSBib3RvMy5jbGllbnQoJ2NvZ25pdG8taWRwJylcblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICB0cnk6XG4gICAgICAgIGlmIGV2ZW50LmdldCgndHJpZ2dlclNvdXJjZScpICE9ICdQcmVTaWduVXBfRXh0ZXJuYWxQcm92aWRlcic6XG4gICAgICAgICAgICByZXR1cm4gZXZlbnRcblxuICAgICAgICB1c2VyX3Bvb2xfaWQgPSBldmVudFsndXNlclBvb2xJZCddXG4gICAgICAgIGVtYWlsID0gZXZlbnRbJ3JlcXVlc3QnXVsndXNlckF0dHJpYnV0ZXMnXS5nZXQoJ2VtYWlsJywgJycpXG5cbiAgICAgICAgaWYgbm90IGVtYWlsOlxuICAgICAgICAgICAgbG9nZ2VyLndhcm5pbmcoJ05vIGVtYWlsIGZvdW5kIGluIGV4dGVybmFsIHByb3ZpZGVyIHNpZ24tdXAgYXR0cmlidXRlcycpXG4gICAgICAgICAgICByZXR1cm4gZXZlbnRcblxuICAgICAgICBsaXN0X3Jlc3BvbnNlID0gY29nbml0b19jbGllbnQubGlzdF91c2VycyhcbiAgICAgICAgICAgIFVzZXJQb29sSWQ9dXNlcl9wb29sX2lkLFxuICAgICAgICAgICAgRmlsdGVyPWYnZW1haWwgPSBcIntlbWFpbH1cIicsXG4gICAgICAgICAgICBMaW1pdD0xLFxuICAgICAgICApXG5cbiAgICAgICAgZXhpc3RpbmdfdXNlcnMgPSBsaXN0X3Jlc3BvbnNlLmdldCgnVXNlcnMnLCBbXSlcbiAgICAgICAgaWYgbm90IGV4aXN0aW5nX3VzZXJzOlxuICAgICAgICAgICAgcmV0dXJuIGV2ZW50XG5cbiAgICAgICAgZXhpc3RpbmdfdXNlciA9IGV4aXN0aW5nX3VzZXJzWzBdXG4gICAgICAgIGV4aXN0aW5nX3VzZXJuYW1lID0gZXhpc3RpbmdfdXNlclsnVXNlcm5hbWUnXVxuXG4gICAgICAgIHVzZXJuYW1lX3BhcnRzID0gZXZlbnRbJ3VzZXJOYW1lJ10uc3BsaXQoJ18nLCAxKVxuICAgICAgICBpZiBsZW4odXNlcm5hbWVfcGFydHMpICE9IDI6XG4gICAgICAgICAgICBsb2dnZXIud2FybmluZyhmJ1VuZXhwZWN0ZWQgdXNlck5hbWUgZm9ybWF0OiB7ZXZlbnRbXCJ1c2VyTmFtZVwiXX0nKVxuICAgICAgICAgICAgcmV0dXJuIGV2ZW50XG5cbiAgICAgICAgcHJvdmlkZXJfbmFtZSA9IHVzZXJuYW1lX3BhcnRzWzBdXG4gICAgICAgIHByb3ZpZGVyX3VzZXJfaWQgPSB1c2VybmFtZV9wYXJ0c1sxXVxuXG4gICAgICAgIGNvZ25pdG9fY2xpZW50LmFkbWluX2xpbmtfcHJvdmlkZXJfZm9yX3VzZXIoXG4gICAgICAgICAgICBVc2VyUG9vbElkPXVzZXJfcG9vbF9pZCxcbiAgICAgICAgICAgIERlc3RpbmF0aW9uVXNlcj17XG4gICAgICAgICAgICAgICAgJ1Byb3ZpZGVyTmFtZSc6ICdDb2duaXRvJyxcbiAgICAgICAgICAgICAgICAnUHJvdmlkZXJBdHRyaWJ1dGVOYW1lJzogJ2NvZ25pdG86dXNlcm5hbWUnLFxuICAgICAgICAgICAgICAgICdQcm92aWRlckF0dHJpYnV0ZVZhbHVlJzogZXhpc3RpbmdfdXNlcm5hbWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgU291cmNlVXNlcj17XG4gICAgICAgICAgICAgICAgJ1Byb3ZpZGVyTmFtZSc6IHByb3ZpZGVyX25hbWUsXG4gICAgICAgICAgICAgICAgJ1Byb3ZpZGVyQXR0cmlidXRlTmFtZSc6ICdDb2duaXRvX1N1YmplY3QnLFxuICAgICAgICAgICAgICAgICdQcm92aWRlckF0dHJpYnV0ZVZhbHVlJzogcHJvdmlkZXJfdXNlcl9pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIClcblxuICAgICAgICBsb2dnZXIuaW5mbyhmJ0xpbmtlZCB7cHJvdmlkZXJfbmFtZX0gaWRlbnRpdHkgdG8gZXhpc3RpbmcgdXNlciB7ZXhpc3RpbmdfdXNlcm5hbWV9JylcbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIGxvZ2dlci5lcnJvcihmJ1ByZVNpZ25VcCBsaW5raW5nIGVycm9yOiB7ZX0nKVxuICAgIHJldHVybiBldmVudFxuYCksXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENPR05JVE8gVVNFUiBQT09MXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnUGRmQ29udmVyc2F0aW9uVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgIHVzZXJuYW1lOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGdpdmVuTmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmYW1pbHlOYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bGxuYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICAnb3JnYW5pemF0aW9uJzogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgJ3JvbGUnOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgICB0ZW1wUGFzc3dvcmRWYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgLy8gRW1haWwgdmVyaWZpY2F0aW9uXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogJ1ZlcmlmeSB5b3VyIFBERiBDb252ZXJzYXRpb24gYWNjb3VudCcsXG4gICAgICAgIGVtYWlsQm9keTogJ1RoYW5rcyBmb3Igc2lnbmluZyB1cCEgWW91ciB2ZXJpZmljYXRpb24gY29kZSBpcyB7IyMjI30nLFxuICAgICAgICBlbWFpbFN0eWxlOiBjb2duaXRvLlZlcmlmaWNhdGlvbkVtYWlsU3R5bGUuQ09ERSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBjZm5Vc2VyUG9vbCA9IHRoaXMudXNlclBvb2wubm9kZS5kZWZhdWx0Q2hpbGQgYXMgY29nbml0by5DZm5Vc2VyUG9vbDtcbiAgICBjZm5Vc2VyUG9vbC5sYW1iZGFDb25maWcgPSB7XG4gICAgICBwcmVTaWduVXA6IHByZVNpZ25VcEZuLmZ1bmN0aW9uQXJuLFxuICAgICAgY3VzdG9tTWVzc2FnZTogY3VzdG9tTWVzc2FnZUZuLmZ1bmN0aW9uQXJuLFxuICAgIH07XG5cbiAgICBwcmVTaWduVXBGbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgJ2NvZ25pdG8taWRwOkxpc3RVc2VycycsXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkxpbmtQcm92aWRlckZvclVzZXInLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmNvZ25pdG8taWRwOiR7cHJvcHMuZW52Q29uZmlnLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnVzZXJwb29sLypgXSxcbiAgICB9KSk7XG5cbiAgICBjdXN0b21NZXNzYWdlRm4uYWRkUGVybWlzc2lvbignQ29nbml0b0ludm9rZUN1c3RvbU1lc3NhZ2UnLCB7XG4gICAgICBwcmluY2lwYWw6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY29nbml0by1pZHAuYW1hem9uYXdzLmNvbScpLFxuICAgICAgYWN0aW9uOiAnbGFtYmRhOkludm9rZUZ1bmN0aW9uJyxcbiAgICAgIHNvdXJjZUFjY291bnQ6IHRoaXMuYWNjb3VudCxcbiAgICB9KTtcblxuICAgIHByZVNpZ25VcEZuLmFkZFBlcm1pc3Npb24oJ0NvZ25pdG9JbnZva2VQcmVTaWduVXAnLCB7XG4gICAgICBwcmluY2lwYWw6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY29nbml0by1pZHAuYW1hem9uYXdzLmNvbScpLFxuICAgICAgYWN0aW9uOiAnbGFtYmRhOkludm9rZUZ1bmN0aW9uJyxcbiAgICAgIHNvdXJjZUFjY291bnQ6IHRoaXMuYWNjb3VudCxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gR09PR0xFIElERU5USVRZIFBST1ZJREVSXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIGNvbnN0IGdvb2dsZUlkUCA9IG5ldyBjb2duaXRvLlVzZXJQb29sSWRlbnRpdHlQcm92aWRlckdvb2dsZSh0aGlzLCAnR29vZ2xlSWRlbnRpdHlQcm92aWRlcicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY2xpZW50SWQ6IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcihgL3BkZmNvbnYvJHtwcm9wcy5lbnZDb25maWcubmFtZX0vZ29vZ2xlLWNsaWVudC1pZGApLnVuc2FmZVVud3JhcCgpLFxuICAgICAgY2xpZW50U2VjcmV0OiBjZGsuU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoYC9wZGZjb252LyR7cHJvcHMuZW52Q29uZmlnLm5hbWV9L2dvb2dsZS1jbGllbnQtc2VjcmV0YCkudW5zYWZlVW53cmFwKCksXG4gICAgICBzY29wZXM6IFsnZW1haWwnLCAncHJvZmlsZScsICdvcGVuaWQnXSxcbiAgICAgIGF0dHJpYnV0ZU1hcHBpbmc6IHtcbiAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0VNQUlMLFxuICAgICAgICBnaXZlbk5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0dJVkVOX05BTUUsXG4gICAgICAgIGZhbWlseU5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0ZBTUlMWV9OQU1FLFxuICAgICAgICBmdWxsbmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfTkFNRSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFVTRVIgUE9PTCBET01BSU5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgbmV3IGNvZ25pdG8uVXNlclBvb2xEb21haW4odGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFVTRVIgUE9PTCBDTElFTlRcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gVXNlciBQb29sIENsaWVudCAoZm9yIGZyb250ZW5kIGFwcClcbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50ID0gdGhpcy51c2VyUG9vbC5hZGRDbGllbnQoJ1BkZkNvbnZlcnNhdGlvbldlYkNsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYCR7cH1wZGYtY29udmVyc2F0aW9uLXdlYi1jbGllbnRgLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdXBwb3J0ZWRJZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICBjb2duaXRvLlVzZXJQb29sQ2xpZW50SWRlbnRpdHlQcm92aWRlci5DT0dOSVRPLFxuICAgICAgICBjb2duaXRvLlVzZXJQb29sQ2xpZW50SWRlbnRpdHlQcm92aWRlci5HT09HTEUsXG4gICAgICBdLFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICAgIGltcGxpY2l0Q29kZUdyYW50OiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvY2FsbGJhY2snLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvJyxcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwL2xvZ2luJyxcbiAgICAgICAgICAuLi4ocHJvcHMuY2xvdWRGcm9udERvbWFpbiA/IFtcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY2xvdWRGcm9udERvbWFpbn0vY2FsbGJhY2tgLFxuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jbG91ZEZyb250RG9tYWlufS9gLFxuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jbG91ZEZyb250RG9tYWlufS9sb2dpbmAsXG4gICAgICAgICAgXSA6IFtdKSxcbiAgICAgICAgICAuLi4ocHJvcHMuY3VzdG9tRG9tYWluTmFtZSA/IFtcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY3VzdG9tRG9tYWluTmFtZX0vY2FsbGJhY2tgLFxuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jdXN0b21Eb21haW5OYW1lfS9gLFxuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jdXN0b21Eb21haW5OYW1lfS9sb2dpbmAsXG4gICAgICAgICAgXSA6IFtdKSxcbiAgICAgICAgXSxcbiAgICAgICAgbG9nb3V0VXJsczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvJyxcbiAgICAgICAgICAuLi4ocHJvcHMuY2xvdWRGcm9udERvbWFpbiA/IFtcbiAgICAgICAgICAgIGBodHRwczovLyR7cHJvcHMuY2xvdWRGcm9udERvbWFpbn0vYCxcbiAgICAgICAgICBdIDogW10pLFxuICAgICAgICAgIC4uLihwcm9wcy5jdXN0b21Eb21haW5OYW1lID8gW1xuICAgICAgICAgICAgYGh0dHBzOi8vJHtwcm9wcy5jdXN0b21Eb21haW5OYW1lfS9gLFxuICAgICAgICAgIF0gOiBbXSksXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXG4gICAgICBhY2Nlc3NUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICAgIHJlZnJlc2hUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICByZWFkQXR0cmlidXRlczogbmV3IGNvZ25pdG8uQ2xpZW50QXR0cmlidXRlcygpXG4gICAgICAgIC53aXRoU3RhbmRhcmRBdHRyaWJ1dGVzKHsgZW1haWw6IHRydWUsIGdpdmVuTmFtZTogdHJ1ZSwgZmFtaWx5TmFtZTogdHJ1ZSwgZnVsbG5hbWU6IHRydWUgfSlcbiAgICAgICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKCdvcmdhbml6YXRpb24nLCAncm9sZScpLFxuICAgIH0pO1xuXG4gICAgdGhpcy51c2VyUG9vbENsaWVudC5ub2RlLmFkZERlcGVuZGVuY3koZ29vZ2xlSWRQKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ09HTklUTyBJREVOVElUWSBQT09MIChmb3IgUzMgZGlyZWN0IHVwbG9hZClcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgdGhpcy5pZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2wodGhpcywgJ1BkZkNvbnZlcnNhdGlvbklkZW50aXR5UG9vbCcsIHtcbiAgICAgIGlkZW50aXR5UG9vbE5hbWU6IGAke3AucmVwbGFjZSgvLS9nLCAnXycpfXBkZl9jb252ZXJzYXRpb25faWRlbnRpdHlfcG9vbGAsXG4gICAgICBhbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IGZhbHNlLFxuICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBjbGllbnRJZDogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgIHByb3ZpZGVyTmFtZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbFByb3ZpZGVyTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgYXV0aGVudGljYXRlZCB1c2Vyc1xuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb2duaXRvQXV0aGVudGljYXRlZFJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYCR7cH1QZGZDb252ZXJzYXRpb24tQ29nbml0b0F1dGhSb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICAgICdGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlJzoge1xuICAgICAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphbXInOiAnYXV0aGVudGljYXRlZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5J1xuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IGF1dGhlbnRpY2F0ZWQgdXNlcnMgdG8gdXBsb2FkIHRvIHRoZWlyIG93biBmb2xkZXIgaW4gUzNcbiAgICBhdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGAke3Byb3BzLnByb2Nlc3NpbmdCdWNrZXQuYnVja2V0QXJufS91c2Vycy9cXCR7Y29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOnN1Yn0vKmAsXG4gICAgICBdLFxuICAgIH0pKTtcblxuICAgIC8vIEFsbG93IGF1dGhlbnRpY2F0ZWQgdXNlcnMgdG8gbGlzdCB0aGVpciBvd24gZm9sZGVyXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbcHJvcHMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXRBcm5dLFxuICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgJ3MzOnByZWZpeCc6IFsndXNlcnMvJHtjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206c3VifS8qJ10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pKTtcblxuICAgIC8vIEF0dGFjaCByb2xlIHRvIGlkZW50aXR5IHBvb2xcbiAgICBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCh0aGlzLCAnSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQnLCB7XG4gICAgICBpZGVudGl0eVBvb2xJZDogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgcm9sZXM6IHtcbiAgICAgICAgYXV0aGVudGljYXRlZDogYXV0aGVudGljYXRlZFJvbGUucm9sZUFybixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEFQSSBHQVRFV0FZXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnUGRmQ29udmVyc2F0aW9uQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICdQREYgQ29udmVyc2F0aW9uIEFQSScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgUERGIENvbnZlcnNhdGlvbiBTeXN0ZW0nLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6ICd2MScsXG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiAxMDAsXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDUwLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IFtcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgICAgICAuLi4ocHJvcHMuY2xvdWRGcm9udERvbWFpbiA/IFtgaHR0cHM6Ly8ke3Byb3BzLmNsb3VkRnJvbnREb21haW59YF0gOiBbXSksXG4gICAgICAgICAgLi4uKHByb3BzLmN1c3RvbURvbWFpbk5hbWUgPyBbYGh0dHBzOi8vJHtwcm9wcy5jdXN0b21Eb21haW5OYW1lfWBdIDogW10pLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gQXV0aG9yaXplclxuICAgIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnQ29nbml0b0F1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdGhpcy51c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogJ0NvZ25pdG9BdXRob3JpemVyJyxcbiAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBBUEkgRU5EUE9JTlRTXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFF1ZXJ5IGVuZHBvaW50IC0gUE9TVCAvcXVlcnlcbiAgICBjb25zdCBxdWVyeVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgncXVlcnknKTtcbiAgICBxdWVyeVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLnF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBEb2N1bWVudHMgZW5kcG9pbnQgLSBHRVQgL2RvY3VtZW50cyAobGlzdCB1c2VyJ3MgZG9jdW1lbnRzKVxuICAgIGNvbnN0IGRvY3VtZW50c1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnZG9jdW1lbnRzJyk7XG5cbiAgICAvLyBMYW1iZGEgZm9yIGxpc3RpbmcgZG9jdW1lbnRzXG4gICAgY29uc3QgbGlzdERvY3VtZW50c0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTGlzdERvY3VtZW50c0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwfUxpc3REb2N1bWVudHNgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCBvc1xuZnJvbSBib3RvMy5keW5hbW9kYi5jb25kaXRpb25zIGltcG9ydCBLZXlcblxuZHluYW1vZGIgPSBib3RvMy5yZXNvdXJjZSgnZHluYW1vZGInKVxudGFibGUgPSBkeW5hbW9kYi5UYWJsZShvcy5lbnZpcm9uWydNRVRBREFUQV9UQUJMRSddKVxuXG5BTExPV0VEX09SSUdJTlMgPSBvcy5lbnZpcm9uLmdldCgnQUxMT1dFRF9PUklHSU5TJywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcpLnNwbGl0KCcsJylcblxuZGVmIGdldF9jb3JzX29yaWdpbihldmVudCk6XG4gICAgb3JpZ2luID0gKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ29yaWdpbicpIG9yIChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdPcmlnaW4nLCAnJylcbiAgICByZXR1cm4gb3JpZ2luIGlmIG9yaWdpbiBpbiBBTExPV0VEX09SSUdJTlMgZWxzZSBBTExPV0VEX09SSUdJTlNbMF1cblxuZGVmIGNvcnNfaGVhZGVycyhldmVudCk6XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IGdldF9jb3JzX29yaWdpbihldmVudCksXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6ICd0cnVlJ1xuICAgIH1cblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICBwcmludChmXCJFdmVudDoge2pzb24uZHVtcHMoZXZlbnQpfVwiKVxuXG4gICAgIyBHZXQgdXNlcl9pZCBmcm9tIENvZ25pdG8gY2xhaW1zXG4gICAgY2xhaW1zID0gZXZlbnQuZ2V0KCdyZXF1ZXN0Q29udGV4dCcsIHt9KS5nZXQoJ2F1dGhvcml6ZXInLCB7fSkuZ2V0KCdjbGFpbXMnLCB7fSlcbiAgICB1c2VyX2lkID0gY2xhaW1zLmdldCgnc3ViJywgJycpXG5cbiAgICBpZiBub3QgdXNlcl9pZDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAxLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnVW5hdXRob3JpemVkJ30pXG4gICAgICAgIH1cblxuICAgIGRlZiBfZXh0cmFjdF90aXRsZShpdGVtKTpcbiAgICAgICAgdHJ5OlxuICAgICAgICAgICAgZ3MgPSBpdGVtLmdldCgnZ2VuZXJhdGVkX3N1bW1hcnknKVxuICAgICAgICAgICAgaWYgbm90IGdzOlxuICAgICAgICAgICAgICAgIHJldHVybiBOb25lXG4gICAgICAgICAgICBpZiBpc2luc3RhbmNlKGdzLCBzdHIpOlxuICAgICAgICAgICAgICAgIGdzID0ganNvbi5sb2FkcyhncylcbiAgICAgICAgICAgIHJldHVybiBncy5nZXQoJ3RpdGxlJylcbiAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbjpcbiAgICAgICAgICAgIHJldHVybiBOb25lXG5cbiAgICB0cnk6XG4gICAgICAgIHJlc3BvbnNlID0gdGFibGUuc2NhbihcbiAgICAgICAgICAgIEZpbHRlckV4cHJlc3Npb249S2V5KCd1c2VyX2lkJykuZXEodXNlcl9pZCksXG4gICAgICAgICAgICBQcm9qZWN0aW9uRXhwcmVzc2lvbj0nZG9jdW1lbnRfaWQsIG9yaWdpbmFsX2ZpbGVuYW1lLCAjcywgY3JlYXRlZF9hdCwgdmVjdG9yX2NvdW50LCBnZW5lcmF0ZWRfc3VtbWFyeScsXG4gICAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM9eycjcyc6ICdzdGF0dXMnfVxuICAgICAgICApXG5cbiAgICAgICAgZG9jdW1lbnRzID0gW3tcbiAgICAgICAgICAgICdkb2N1bWVudF9pZCc6IGl0ZW1bJ2RvY3VtZW50X2lkJ10sXG4gICAgICAgICAgICAnZmlsZW5hbWUnOiBpdGVtLmdldCgnb3JpZ2luYWxfZmlsZW5hbWUnLCAnVW5rbm93bicpLFxuICAgICAgICAgICAgJ3N0YXR1cyc6IGl0ZW0uZ2V0KCdzdGF0dXMnLCAndW5rbm93bicpLFxuICAgICAgICAgICAgJ2NyZWF0ZWRfYXQnOiBpdGVtLmdldCgnY3JlYXRlZF9hdCcsICcnKSxcbiAgICAgICAgICAgICd2ZWN0b3JfY291bnQnOiBpbnQoaXRlbS5nZXQoJ3ZlY3Rvcl9jb3VudCcsIDApKSBpZiBpdGVtLmdldCgndmVjdG9yX2NvdW50JykgZWxzZSAwLFxuICAgICAgICAgICAgJ3RpdGxlJzogX2V4dHJhY3RfdGl0bGUoaXRlbSlcbiAgICAgICAgfSBmb3IgaXRlbSBpbiByZXNwb25zZS5nZXQoJ0l0ZW1zJywgW10pXVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDIwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7XG4gICAgICAgICAgICAgICAgJ2RvY3VtZW50cyc6IGRvY3VtZW50cyxcbiAgICAgICAgICAgICAgICAnY291bnQnOiBsZW4oZG9jdW1lbnRzKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgcHJpbnQoZlwiRXJyb3I6IHtzdHIoZSl9XCIpXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDUwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogc3RyKGUpfSlcbiAgICAgICAgfVxuYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBNRVRBREFUQV9UQUJMRTogcHJvcHMubWV0YWRhdGFUYWJsZU5hbWUsXG4gICAgICAgIEFMTE9XRURfT1JJR0lOUzogYWxsb3dlZE9yaWdpbnMsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcmVhZCBhY2Nlc3NcbiAgICBsaXN0RG9jdW1lbnRzRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS8ke3Byb3BzLm1ldGFkYXRhVGFibGVOYW1lfWBdLFxuICAgIH0pKTtcblxuICAgIGRvY3VtZW50c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24obGlzdERvY3VtZW50c0Z1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBVcGxvYWQgcHJlc2lnbmVkIFVSTCBlbmRwb2ludCAtIFBPU1QgL3VwbG9hZC9wcmVzaWduZWRcbiAgICBjb25zdCB1cGxvYWRSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VwbG9hZCcpO1xuICAgIGNvbnN0IHByZXNpZ25lZFJlc291cmNlID0gdXBsb2FkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3ByZXNpZ25lZCcpO1xuXG4gICAgY29uc3QgcHJlc2lnbmVkVXJsRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcmVzaWduZWRVcmxGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1HZW5lcmF0ZVByZXNpZ25lZFVybGAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IG9zXG5pbXBvcnQgcmVcbmltcG9ydCB1dWlkXG5mcm9tIGRhdGV0aW1lIGltcG9ydCBkYXRldGltZVxuXG5zM19jbGllbnQgPSBib3RvMy5jbGllbnQoJ3MzJylcbmR5bmFtb2RiID0gYm90bzMucmVzb3VyY2UoJ2R5bmFtb2RiJylcbkJVQ0tFVF9OQU1FID0gb3MuZW52aXJvblsnQlVDS0VUX05BTUUnXVxuTUVUQURBVEFfVEFCTEUgPSBvcy5lbnZpcm9uWydNRVRBREFUQV9UQUJMRSddXG5cbkFMTE9XRURfT1JJR0lOUyA9IG9zLmVudmlyb24uZ2V0KCdBTExPV0VEX09SSUdJTlMnLCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJykuc3BsaXQoJywnKVxuXG5kZWYgZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KTpcbiAgICBvcmlnaW4gPSAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnb3JpZ2luJykgb3IgKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ09yaWdpbicsICcnKVxuICAgIHJldHVybiBvcmlnaW4gaWYgb3JpZ2luIGluIEFMTE9XRURfT1JJR0lOUyBlbHNlIEFMTE9XRURfT1JJR0lOU1swXVxuXG5kZWYgY29yc19oZWFkZXJzKGV2ZW50KTpcbiAgICByZXR1cm4ge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogZ2V0X2NvcnNfb3JpZ2luKGV2ZW50KSxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogJ3RydWUnXG4gICAgfVxuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIHByaW50KGZcIkV2ZW50OiB7anNvbi5kdW1wcyhldmVudCl9XCIpXG5cbiAgICBjbGFpbXMgPSBldmVudC5nZXQoJ3JlcXVlc3RDb250ZXh0Jywge30pLmdldCgnYXV0aG9yaXplcicsIHt9KS5nZXQoJ2NsYWltcycsIHt9KVxuICAgIHVzZXJfaWQgPSBjbGFpbXMuZ2V0KCdzdWInLCAnJylcblxuICAgIGlmIG5vdCB1c2VyX2lkOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA0MDEsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdVbmF1dGhvcml6ZWQnfSlcbiAgICAgICAgfVxuXG4gICAgdHJ5OlxuICAgICAgICBib2R5ID0ganNvbi5sb2FkcyhldmVudC5nZXQoJ2JvZHknLCAne30nKSlcbiAgICAgICAgb3JpZ2luYWxfZmlsZW5hbWUgPSBib2R5LmdldCgnZmlsZW5hbWUnLCAnZG9jdW1lbnQucGRmJylcbiAgICAgICAgb3JpZ2luYWxfZmlsZW5hbWUgPSByZS5zdWIocidbL1xcXFxcXFxcPD46XCJ8PypcXFxceDAwLVxcXFx4MWZdJywgJ18nLCBvcmlnaW5hbF9maWxlbmFtZSlcbiAgICAgICAgaWYgbGVuKG9yaWdpbmFsX2ZpbGVuYW1lKSA+IDI1NTpcbiAgICAgICAgICAgIG9yaWdpbmFsX2ZpbGVuYW1lID0gb3JpZ2luYWxfZmlsZW5hbWVbOjI1NV1cbiAgICAgICAgY29udGVudF90eXBlID0gYm9keS5nZXQoJ2NvbnRlbnRfdHlwZScsICdhcHBsaWNhdGlvbi9wZGYnKVxuXG4gICAgICAgIGRvY3VtZW50X2lkID0gc3RyKHV1aWQudXVpZDQoKSlcbiAgICAgICAgczNfa2V5ID0gZlwidXNlcnMve3VzZXJfaWR9L3tkb2N1bWVudF9pZH0ucGRmXCJcblxuICAgICAgICB0YWJsZSA9IGR5bmFtb2RiLlRhYmxlKE1FVEFEQVRBX1RBQkxFKVxuICAgICAgICB0YWJsZS5wdXRfaXRlbShJdGVtPXtcbiAgICAgICAgICAgICdkb2N1bWVudF9pZCc6IGRvY3VtZW50X2lkLFxuICAgICAgICAgICAgJ3VzZXJfaWQnOiB1c2VyX2lkLFxuICAgICAgICAgICAgJ29yaWdpbmFsX2ZpbGVuYW1lJzogb3JpZ2luYWxfZmlsZW5hbWUsXG4gICAgICAgICAgICAnb3JpZ2luYWxfczNfbG9jYXRpb24nOiB7J2J1Y2tldCc6IEJVQ0tFVF9OQU1FLCAna2V5JzogczNfa2V5fSxcbiAgICAgICAgICAgICdzdGF0dXMnOiAndXBsb2FkaW5nJyxcbiAgICAgICAgICAgICdjcmVhdGVkX2F0JzogZGF0ZXRpbWUudXRjbm93KCkuaXNvZm9ybWF0KCksXG4gICAgICAgICAgICAncHJvY2Vzc2luZ19tZXRhZGF0YSc6IHt9XG4gICAgICAgIH0pXG5cbiAgICAgICAgcHJlc2lnbmVkX3VybCA9IHMzX2NsaWVudC5nZW5lcmF0ZV9wcmVzaWduZWRfdXJsKFxuICAgICAgICAgICAgJ3B1dF9vYmplY3QnLFxuICAgICAgICAgICAgUGFyYW1zPXtcbiAgICAgICAgICAgICAgICAnQnVja2V0JzogQlVDS0VUX05BTUUsXG4gICAgICAgICAgICAgICAgJ0tleSc6IHMzX2tleSxcbiAgICAgICAgICAgICAgICAnQ29udGVudFR5cGUnOiBjb250ZW50X3R5cGUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgRXhwaXJlc0luPTM2MDBcbiAgICAgICAgKVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDIwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7XG4gICAgICAgICAgICAgICAgJ3ByZXNpZ25lZF91cmwnOiBwcmVzaWduZWRfdXJsLFxuICAgICAgICAgICAgICAgICdkb2N1bWVudF9pZCc6IGRvY3VtZW50X2lkLFxuICAgICAgICAgICAgICAgICdleHBpcmVzX2luJzogMzYwMFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgcHJpbnQoZlwiRXJyb3I6IHtzdHIoZSl9XCIpXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDUwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ0ZhaWxlZCB0byBnZW5lcmF0ZSB1cGxvYWQgVVJMJ30pXG4gICAgICAgIH1cbmApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQlVDS0VUX05BTUU6IHByb3BzLnByb2Nlc3NpbmdCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHByb3BzLm1ldGFkYXRhVGFibGVOYW1lLFxuICAgICAgICBBTExPV0VEX09SSUdJTlM6IGFsbG93ZWRPcmlnaW5zLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFMzIHBlcm1pc3Npb25zIGZvciBwcmVzaWduZWQgVVJMc1xuICAgIHByZXNpZ25lZFVybEZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ3MzOlB1dE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvcHMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICB9KSk7XG5cbiAgICBwcmVzaWduZWRVcmxGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydkeW5hbW9kYjpQdXRJdGVtJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvJHtwcm9wcy5tZXRhZGF0YVRhYmxlTmFtZX1gXSxcbiAgICB9KSk7XG5cbiAgICBwcmVzaWduZWRSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcmVzaWduZWRVcmxGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZ2V0RG9jdW1lbnRTdW1tYXJ5RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXREb2N1bWVudFN1bW1hcnlGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cH1HZXREb2N1bWVudFN1bW1hcnlgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCBvc1xuZnJvbSBkZWNpbWFsIGltcG9ydCBEZWNpbWFsXG5cbmR5bmFtb2RiID0gYm90bzMucmVzb3VyY2UoJ2R5bmFtb2RiJylcbnRhYmxlID0gZHluYW1vZGIuVGFibGUob3MuZW52aXJvblsnTUVUQURBVEFfVEFCTEUnXSlcblxuQUxMT1dFRF9PUklHSU5TID0gb3MuZW52aXJvbi5nZXQoJ0FMTE9XRURfT1JJR0lOUycsICdodHRwOi8vbG9jYWxob3N0OjMwMDAnKS5zcGxpdCgnLCcpXG5cbmRlZiBnZXRfY29yc19vcmlnaW4oZXZlbnQpOlxuICAgIG9yaWdpbiA9IChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdvcmlnaW4nKSBvciAoZXZlbnQuZ2V0KCdoZWFkZXJzJykgb3Ige30pLmdldCgnT3JpZ2luJywgJycpXG4gICAgcmV0dXJuIG9yaWdpbiBpZiBvcmlnaW4gaW4gQUxMT1dFRF9PUklHSU5TIGVsc2UgQUxMT1dFRF9PUklHSU5TWzBdXG5cbmRlZiBjb3JzX2hlYWRlcnMoZXZlbnQpOlxuICAgIHJldHVybiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBnZXRfY29yc19vcmlnaW4oZXZlbnQpLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiAndHJ1ZSdcbiAgICB9XG5cbmRlZiBkZWNpbWFsX2RlZmF1bHQob2JqKTpcbiAgICBpZiBpc2luc3RhbmNlKG9iaiwgRGVjaW1hbCk6XG4gICAgICAgIHJldHVybiBpbnQob2JqKSBpZiBvYmogJSAxID09IDAgZWxzZSBmbG9hdChvYmopXG4gICAgcmFpc2UgVHlwZUVycm9yXG5cbmRlZiBsYW1iZGFfaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgY2xhaW1zID0gZXZlbnQuZ2V0KCdyZXF1ZXN0Q29udGV4dCcsIHt9KS5nZXQoJ2F1dGhvcml6ZXInLCB7fSkuZ2V0KCdjbGFpbXMnLCB7fSlcbiAgICB1c2VyX2lkID0gY2xhaW1zLmdldCgnc3ViJywgJycpXG5cbiAgICBpZiBub3QgdXNlcl9pZDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAxLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnVW5hdXRob3JpemVkJ30pXG4gICAgICAgIH1cblxuICAgIHBhdGhfcGFyYW1zID0gZXZlbnQuZ2V0KCdwYXRoUGFyYW1ldGVycycpIG9yIHt9XG4gICAgZG9jdW1lbnRfaWQgPSBwYXRoX3BhcmFtcy5nZXQoJ2lkJywgJycpXG5cbiAgICBpZiBub3QgZG9jdW1lbnRfaWQ6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ01pc3NpbmcgZG9jdW1lbnQgSUQnfSlcbiAgICAgICAgfVxuXG4gICAgdHJ5OlxuICAgICAgICByZXNwb25zZSA9IHRhYmxlLmdldF9pdGVtKEtleT17J2RvY3VtZW50X2lkJzogZG9jdW1lbnRfaWR9KVxuXG4gICAgICAgIGlmICdJdGVtJyBub3QgaW4gcmVzcG9uc2U6XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDA0LFxuICAgICAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdEb2N1bWVudCBub3QgZm91bmQnfSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICBpdGVtID0gcmVzcG9uc2VbJ0l0ZW0nXVxuXG4gICAgICAgIGlmIGl0ZW0uZ2V0KCd1c2VyX2lkJywgJycpICE9IHVzZXJfaWQ6XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDA0LFxuICAgICAgICAgICAgICAgICdoZWFkZXJzJzogY29yc19oZWFkZXJzKGV2ZW50KSxcbiAgICAgICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdEb2N1bWVudCBub3QgZm91bmQnfSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICByZXN1bHQgPSB7XG4gICAgICAgICAgICAnZG9jdW1lbnRfaWQnOiBpdGVtWydkb2N1bWVudF9pZCddLFxuICAgICAgICAgICAgJ2ZpbGVuYW1lJzogaXRlbS5nZXQoJ29yaWdpbmFsX2ZpbGVuYW1lJywgJ1Vua25vd24nKSxcbiAgICAgICAgICAgICdzdGF0dXMnOiBpdGVtLmdldCgnc3RhdHVzJywgJ3Vua25vd24nKSxcbiAgICAgICAgICAgICdnZW5lcmF0ZWRfc3VtbWFyeSc6IGl0ZW0uZ2V0KCdnZW5lcmF0ZWRfc3VtbWFyeScpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAnc3VtbWFyeV9nZW5lcmF0ZWRfYXQnIGluIGl0ZW06XG4gICAgICAgICAgICByZXN1bHRbJ3N1bW1hcnlfZ2VuZXJhdGVkX2F0J10gPSBpdGVtWydzdW1tYXJ5X2dlbmVyYXRlZF9hdCddXG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogMjAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiBjb3JzX2hlYWRlcnMoZXZlbnQpLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHJlc3VsdCwgZGVmYXVsdD1kZWNpbWFsX2RlZmF1bHQpXG4gICAgICAgIH1cbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIHByaW50KGZcIkVycm9yOiB7c3RyKGUpfVwiKVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA1MDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6IHN0cihlKX0pXG4gICAgICAgIH1cbmApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHByb3BzLm1ldGFkYXRhVGFibGVOYW1lLFxuICAgICAgICBBTExPV0VEX09SSUdJTlM6IGFsbG93ZWRPcmlnaW5zLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICB9KTtcblxuICAgIGdldERvY3VtZW50U3VtbWFyeUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOkdldEl0ZW0nXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS8ke3Byb3BzLm1ldGFkYXRhVGFibGVOYW1lfWBdLFxuICAgIH0pKTtcblxuICAgIGNvbnN0IGRvY3VtZW50SWRSZXNvdXJjZSA9IGRvY3VtZW50c1Jlc291cmNlLmFkZFJlc291cmNlKCd7aWR9Jyk7XG4gICAgY29uc3Qgc3VtbWFyeVJlc291cmNlID0gZG9jdW1lbnRJZFJlc291cmNlLmFkZFJlc291cmNlKCdzdW1tYXJ5Jyk7XG5cbiAgICBzdW1tYXJ5UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXREb2N1bWVudFN1bW1hcnlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29udmVyc2F0aW9uc1Jlc291cmNlID0gZG9jdW1lbnRJZFJlc291cmNlLmFkZFJlc291cmNlKCdjb252ZXJzYXRpb25zJyk7XG4gICAgY29udmVyc2F0aW9uc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuY29udmVyc2F0aW9uRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICBjb252ZXJzYXRpb25zUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvcHMuY29udmVyc2F0aW9uRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbklkUmVzb3VyY2UgPSBjb252ZXJzYXRpb25zUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tjb252SWR9Jyk7XG4gICAgY29udmVyc2F0aW9uSWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLmNvbnZlcnNhdGlvbkZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBEZWxldGUgYWNjb3VudCBlbmRwb2ludCAtIERFTEVURSAvdXNlcnMvbWVcbiAgICBjb25zdCBkZWxldGVBY2NvdW50RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEZWxldGVBY2NvdW50RnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3B9RGVsZXRlQWNjb3VudGAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IG9zXG5mcm9tIGJvdG8zLmR5bmFtb2RiLmNvbmRpdGlvbnMgaW1wb3J0IEF0dHJcblxuczNfY2xpZW50ID0gYm90bzMuY2xpZW50KCdzMycpXG5keW5hbW9kYiA9IGJvdG8zLnJlc291cmNlKCdkeW5hbW9kYicpXG5CVUNLRVRfTkFNRSA9IG9zLmVudmlyb25bJ0JVQ0tFVF9OQU1FJ11cbk1FVEFEQVRBX1RBQkxFID0gb3MuZW52aXJvblsnTUVUQURBVEFfVEFCTEUnXVxuXG5BTExPV0VEX09SSUdJTlMgPSBvcy5lbnZpcm9uLmdldCgnQUxMT1dFRF9PUklHSU5TJywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcpLnNwbGl0KCcsJylcblxuZGVmIGdldF9jb3JzX29yaWdpbihldmVudCk6XG4gICAgb3JpZ2luID0gKGV2ZW50LmdldCgnaGVhZGVycycpIG9yIHt9KS5nZXQoJ29yaWdpbicpIG9yIChldmVudC5nZXQoJ2hlYWRlcnMnKSBvciB7fSkuZ2V0KCdPcmlnaW4nLCAnJylcbiAgICByZXR1cm4gb3JpZ2luIGlmIG9yaWdpbiBpbiBBTExPV0VEX09SSUdJTlMgZWxzZSBBTExPV0VEX09SSUdJTlNbMF1cblxuZGVmIGNvcnNfaGVhZGVycyhldmVudCk6XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IGdldF9jb3JzX29yaWdpbihldmVudCksXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6ICd0cnVlJ1xuICAgIH1cblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICBjbGFpbXMgPSBldmVudC5nZXQoJ3JlcXVlc3RDb250ZXh0Jywge30pLmdldCgnYXV0aG9yaXplcicsIHt9KS5nZXQoJ2NsYWltcycsIHt9KVxuICAgIHVzZXJfaWQgPSBjbGFpbXMuZ2V0KCdzdWInLCAnJylcblxuICAgIGlmIG5vdCB1c2VyX2lkOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA0MDEsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdVbmF1dGhvcml6ZWQnfSlcbiAgICAgICAgfVxuXG4gICAgdHJ5OlxuICAgICAgICB0YWJsZSA9IGR5bmFtb2RiLlRhYmxlKE1FVEFEQVRBX1RBQkxFKVxuXG4gICAgICAgICMgU2NhbiBmb3IgYWxsIGRvY3VtZW50cyBiZWxvbmdpbmcgdG8gdGhpcyB1c2VyXG4gICAgICAgIHJlc3BvbnNlID0gdGFibGUuc2NhbihGaWx0ZXJFeHByZXNzaW9uPUF0dHIoJ3VzZXJfaWQnKS5lcSh1c2VyX2lkKSlcbiAgICAgICAgaXRlbXMgPSByZXNwb25zZS5nZXQoJ0l0ZW1zJywgW10pXG4gICAgICAgIHdoaWxlICdMYXN0RXZhbHVhdGVkS2V5JyBpbiByZXNwb25zZTpcbiAgICAgICAgICAgIHJlc3BvbnNlID0gdGFibGUuc2NhbihcbiAgICAgICAgICAgICAgICBGaWx0ZXJFeHByZXNzaW9uPUF0dHIoJ3VzZXJfaWQnKS5lcSh1c2VyX2lkKSxcbiAgICAgICAgICAgICAgICBFeGNsdXNpdmVTdGFydEtleT1yZXNwb25zZVsnTGFzdEV2YWx1YXRlZEtleSddXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBpdGVtcy5leHRlbmQocmVzcG9uc2UuZ2V0KCdJdGVtcycsIFtdKSlcblxuICAgICAgICAjIERlbGV0ZSBlYWNoIHRyYWNrZWQgUzMgb2JqZWN0XG4gICAgICAgIGZvciBpdGVtIGluIGl0ZW1zOlxuICAgICAgICAgICAgczNfbG9jID0gaXRlbS5nZXQoJ29yaWdpbmFsX3MzX2xvY2F0aW9uJywge30pXG4gICAgICAgICAgICBrZXkgPSBzM19sb2MuZ2V0KCdrZXknLCAnJylcbiAgICAgICAgICAgIGlmIGtleTpcbiAgICAgICAgICAgICAgICBzM19jbGllbnQuZGVsZXRlX29iamVjdChCdWNrZXQ9QlVDS0VUX05BTUUsIEtleT1rZXkpXG5cbiAgICAgICAgIyBEZWxldGUgYW55IG9ycGhhbmVkIG9iamVjdHMgdW5kZXIgdXNlcnMve3VzZXJfaWR9L1xuICAgICAgICBwYWdpbmF0b3IgPSBzM19jbGllbnQuZ2V0X3BhZ2luYXRvcignbGlzdF9vYmplY3RzX3YyJylcbiAgICAgICAgZm9yIHBhZ2UgaW4gcGFnaW5hdG9yLnBhZ2luYXRlKEJ1Y2tldD1CVUNLRVRfTkFNRSwgUHJlZml4PWYndXNlcnMve3VzZXJfaWR9LycpOlxuICAgICAgICAgICAgb2JqZWN0cyA9IFt7J0tleSc6IG9ialsnS2V5J119IGZvciBvYmogaW4gcGFnZS5nZXQoJ0NvbnRlbnRzJywgW10pXVxuICAgICAgICAgICAgaWYgb2JqZWN0czpcbiAgICAgICAgICAgICAgICBzM19jbGllbnQuZGVsZXRlX29iamVjdHMoQnVja2V0PUJVQ0tFVF9OQU1FLCBEZWxldGU9eydPYmplY3RzJzogb2JqZWN0c30pXG5cbiAgICAgICAgIyBCYXRjaC1kZWxldGUgRHluYW1vREIgcmVjb3Jkc1xuICAgICAgICB3aXRoIHRhYmxlLmJhdGNoX3dyaXRlcigpIGFzIGJhdGNoOlxuICAgICAgICAgICAgZm9yIGl0ZW0gaW4gaXRlbXM6XG4gICAgICAgICAgICAgICAgYmF0Y2guZGVsZXRlX2l0ZW0oS2V5PXsnZG9jdW1lbnRfaWQnOiBpdGVtWydkb2N1bWVudF9pZCddfSlcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiAyMDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydtZXNzYWdlJzogJ0FjY291bnQgZGF0YSBkZWxldGVkJ30pXG4gICAgICAgIH1cbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIHByaW50KGZcIkVycm9yOiB7c3RyKGUpfVwiKVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiA1MDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IGNvcnNfaGVhZGVycyhldmVudCksXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6IHN0cihlKX0pXG4gICAgICAgIH1cbmApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQlVDS0VUX05BTUU6IHByb3BzLnByb2Nlc3NpbmdCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHByb3BzLm1ldGFkYXRhVGFibGVOYW1lLFxuICAgICAgICBBTExPV0VEX09SSUdJTlM6IGFsbG93ZWRPcmlnaW5zLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICB9KTtcblxuICAgIGRlbGV0ZUFjY291bnRGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydkeW5hbW9kYjpTY2FuJywgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nLCAnZHluYW1vZGI6QmF0Y2hXcml0ZUl0ZW0nXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS8ke3Byb3BzLm1ldGFkYXRhVGFibGVOYW1lfWBdLFxuICAgIH0pKTtcblxuICAgIGRlbGV0ZUFjY291bnRGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydzMzpEZWxldGVPYmplY3QnLCAnczM6TGlzdEJ1Y2tldCddLFxuICAgICAgcmVzb3VyY2VzOiBbcHJvcHMucHJvY2Vzc2luZ0J1Y2tldC5idWNrZXRBcm4sIGAke3Byb3BzLnByb2Nlc3NpbmdCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgfSkpO1xuXG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXJzJyk7XG4gICAgY29uc3QgbWVSZXNvdXJjZSA9IHVzZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ21lJyk7XG4gICAgbWVSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGRlbGV0ZUFjY291bnRGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNhZ2VSZXNvdXJjZSA9IG1lUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3VzYWdlJyk7XG4gICAgdXNhZ2VSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3BzLnVzYWdlRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gT1VUUFVUU1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9UGRmQ29udmVyc2F0aW9uLVVzZXJQb29sSWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1QZGZDb252ZXJzYXRpb24tVXNlclBvb2xDbGllbnRJZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSWRlbnRpdHlQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIElkZW50aXR5IFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cH1QZGZDb252ZXJzYXRpb24tSWRlbnRpdHlQb29sSWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgRW5kcG9pbnQgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9UGRmQ29udmVyc2F0aW9uLUFwaUVuZHBvaW50YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvUmVnaW9uJywge1xuICAgICAgdmFsdWU6IHRoaXMucmVnaW9uLFxuICAgICAgZGVzY3JpcHRpb246ICdBV1MgUmVnaW9uIGZvciBDb2duaXRvJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3B9UGRmQ29udmVyc2F0aW9uLUNvZ25pdG9SZWdpb25gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sRG9tYWluT3V0cHV0Jywge1xuICAgICAgdmFsdWU6IGAke2RvbWFpblByZWZpeH0uYXV0aC4ke3RoaXMucmVnaW9ufS5hbWF6b25jb2duaXRvLmNvbWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIERvbWFpbicsXG4gICAgICBleHBvcnROYW1lOiBgJHtwfVBkZkNvbnZlcnNhdGlvbi1Vc2VyUG9vbERvbWFpbmAsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
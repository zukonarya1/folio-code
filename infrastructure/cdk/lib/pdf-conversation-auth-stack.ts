import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { EnvironmentConfig } from './environment-config';

export interface PdfConversationAuthStackProps extends cdk.StackProps {
  readonly queryProcessingFunction: lambda.IFunction;
  readonly documentIngestionFunction: lambda.IFunction;
  readonly processingBucket: s3.IBucket;
  readonly metadataTableName: string;
  readonly conversationFunction: lambda.IFunction;
  readonly usageFunction: lambda.IFunction;
  readonly cloudFrontDomain?: string;
  readonly customDomainName?: string;
  readonly envConfig: EnvironmentConfig;
}

export class PdfConversationAuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly api: apigateway.RestApi;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: PdfConversationAuthStackProps) {
    super(scope, id, props);

    const p = props.envConfig.prefix;

    const domainPrefixMap: Record<string, string> = {
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

    const cfnUserPool = this.userPool.node.defaultChild as cognito.CfnUserPool;
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
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
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

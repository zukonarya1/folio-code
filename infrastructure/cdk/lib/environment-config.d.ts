export type EnvironmentName = 'dev' | 'staging' | 'prod';
export interface EnvironmentConfig {
    name: EnvironmentName;
    prefix: string;
    region: string;
    domainName?: string;
    deletionPolicy: 'RETAIN' | 'DESTROY';
    allowedCorsOrigins: string[];
    userPoolId: string;
}
export declare function buildEnvironmentConfig(name: EnvironmentName): EnvironmentConfig;

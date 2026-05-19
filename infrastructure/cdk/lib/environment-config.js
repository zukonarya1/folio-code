"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEnvironmentConfig = buildEnvironmentConfig;
function buildEnvironmentConfig(name) {
    const base = {
        region: 'us-west-2',
    };
    switch (name) {
        case 'prod':
            return {
                ...base,
                name: 'prod',
                prefix: '',
                domainName: 'folio.zukonarya.com',
                deletionPolicy: 'RETAIN',
                allowedCorsOrigins: [
                    'http://localhost:3000',
                    'https://d20i1jxkq2rcuo.cloudfront.net',
                    'https://folio.zukonarya.com',
                ],
                userPoolId: 'us-west-2_dU8CUUTew',
            };
        case 'staging':
            return {
                ...base,
                name: 'staging',
                prefix: 'staging-',
                deletionPolicy: 'RETAIN',
                allowedCorsOrigins: ['http://localhost:3000'],
                userPoolId: 'us-west-2_C7ybOyeoW',
            };
        case 'dev':
            return {
                ...base,
                name: 'dev',
                prefix: 'dev-',
                deletionPolicy: 'DESTROY',
                allowedCorsOrigins: [
                    'http://localhost:3000',
                    'https://d1zt32z8u8ijf3.cloudfront.net',
                ],
                userPoolId: 'us-west-2_5mBfueXlz',
            };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW52aXJvbm1lbnQtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsd0RBMENDO0FBMUNELFNBQWdCLHNCQUFzQixDQUFDLElBQXFCO0lBQzFELE1BQU0sSUFBSSxHQUFHO1FBQ1gsTUFBTSxFQUFFLFdBQVc7S0FDcEIsQ0FBQztJQUVGLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDYixLQUFLLE1BQU07WUFDVCxPQUFPO2dCQUNMLEdBQUcsSUFBSTtnQkFDUCxJQUFJLEVBQUUsTUFBTTtnQkFDWixNQUFNLEVBQUUsRUFBRTtnQkFDVixVQUFVLEVBQUUscUJBQXFCO2dCQUNqQyxjQUFjLEVBQUUsUUFBUTtnQkFDeEIsa0JBQWtCLEVBQUU7b0JBQ2xCLHVCQUF1QjtvQkFDdkIsdUNBQXVDO29CQUN2Qyw2QkFBNkI7aUJBQzlCO2dCQUNELFVBQVUsRUFBRSxxQkFBcUI7YUFDbEMsQ0FBQztRQUNKLEtBQUssU0FBUztZQUNaLE9BQU87Z0JBQ0wsR0FBRyxJQUFJO2dCQUNQLElBQUksRUFBRSxTQUFTO2dCQUNmLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixjQUFjLEVBQUUsUUFBUTtnQkFDeEIsa0JBQWtCLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQztnQkFDN0MsVUFBVSxFQUFFLHFCQUFxQjthQUNsQyxDQUFDO1FBQ0osS0FBSyxLQUFLO1lBQ1IsT0FBTztnQkFDTCxHQUFHLElBQUk7Z0JBQ1AsSUFBSSxFQUFFLEtBQUs7Z0JBQ1gsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsY0FBYyxFQUFFLFNBQVM7Z0JBQ3pCLGtCQUFrQixFQUFFO29CQUNsQix1QkFBdUI7b0JBQ3ZCLHVDQUF1QztpQkFDeEM7Z0JBQ0QsVUFBVSxFQUFFLHFCQUFxQjthQUNsQyxDQUFDO0lBQ04sQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgdHlwZSBFbnZpcm9ubWVudE5hbWUgPSAnZGV2JyB8ICdzdGFnaW5nJyB8ICdwcm9kJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnZpcm9ubWVudENvbmZpZyB7XG4gIG5hbWU6IEVudmlyb25tZW50TmFtZTtcbiAgcHJlZml4OiBzdHJpbmc7XG4gIHJlZ2lvbjogc3RyaW5nO1xuICBkb21haW5OYW1lPzogc3RyaW5nO1xuICBkZWxldGlvblBvbGljeTogJ1JFVEFJTicgfCAnREVTVFJPWSc7XG4gIGFsbG93ZWRDb3JzT3JpZ2luczogc3RyaW5nW107XG4gIHVzZXJQb29sSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRW52aXJvbm1lbnRDb25maWcobmFtZTogRW52aXJvbm1lbnROYW1lKTogRW52aXJvbm1lbnRDb25maWcge1xuICBjb25zdCBiYXNlID0ge1xuICAgIHJlZ2lvbjogJ3VzLXdlc3QtMicsXG4gIH07XG5cbiAgc3dpdGNoIChuYW1lKSB7XG4gICAgY2FzZSAncHJvZCc6XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5iYXNlLFxuICAgICAgICBuYW1lOiAncHJvZCcsXG4gICAgICAgIHByZWZpeDogJycsXG4gICAgICAgIGRvbWFpbk5hbWU6ICdmb2xpby56dWtvbmFyeWEuY29tJyxcbiAgICAgICAgZGVsZXRpb25Qb2xpY3k6ICdSRVRBSU4nLFxuICAgICAgICBhbGxvd2VkQ29yc09yaWdpbnM6IFtcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgICAgICAnaHR0cHM6Ly9kMjBpMWp4a3EycmN1by5jbG91ZGZyb250Lm5ldCcsXG4gICAgICAgICAgJ2h0dHBzOi8vZm9saW8uenVrb25hcnlhLmNvbScsXG4gICAgICAgIF0sXG4gICAgICAgIHVzZXJQb29sSWQ6ICd1cy13ZXN0LTJfZFU4Q1VVVGV3JyxcbiAgICAgIH07XG4gICAgY2FzZSAnc3RhZ2luZyc6XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5iYXNlLFxuICAgICAgICBuYW1lOiAnc3RhZ2luZycsXG4gICAgICAgIHByZWZpeDogJ3N0YWdpbmctJyxcbiAgICAgICAgZGVsZXRpb25Qb2xpY3k6ICdSRVRBSU4nLFxuICAgICAgICBhbGxvd2VkQ29yc09yaWdpbnM6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJ10sXG4gICAgICAgIHVzZXJQb29sSWQ6ICd1cy13ZXN0LTJfQzd5Yk95ZW9XJyxcbiAgICAgIH07XG4gICAgY2FzZSAnZGV2JzpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLmJhc2UsXG4gICAgICAgIG5hbWU6ICdkZXYnLFxuICAgICAgICBwcmVmaXg6ICdkZXYtJyxcbiAgICAgICAgZGVsZXRpb25Qb2xpY3k6ICdERVNUUk9ZJyxcbiAgICAgICAgYWxsb3dlZENvcnNPcmlnaW5zOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgICAgJ2h0dHBzOi8vZDF6dDMyejh1OGlqZjMuY2xvdWRmcm9udC5uZXQnLFxuICAgICAgICBdLFxuICAgICAgICB1c2VyUG9vbElkOiAndXMtd2VzdC0yXzVtQmZ1ZVhseicsXG4gICAgICB9O1xuICB9XG59XG4iXX0=
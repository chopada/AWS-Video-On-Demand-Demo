const { v4: uuidv4 } = require('uuid');
const utils = require('./lib/utils.js');

module.exports.submitJob = async (event, context) => {
    console.log(context.LogGroupName);
    console.log(`REQUEST:: ${JSON.stringify(event, null, 2)}`);
    const {
        MEDIACONVERT_ENDPOINT,
        MEDIACONVERT_ROLE,
        JOB_SETTINGS,
        DESTINATION_BUCKET,
        SNS_TOPIC_ARN
    } = process.env;

    try {
        /**
         * define inputs/ouputs and a unique string for the mediaconver output path in S3. 
         */
        console.log(event);
        const srcVideo = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
        const srcBucket = decodeURIComponent(event.Records[0].s3.bucket.name);
        const settingsFile = `${JOB_SETTINGS}`;
        const guid = uuidv4();
        const inputPath = `s3://${srcBucket}/${srcVideo}`;
        const outputPath = `s3://${DESTINATION_BUCKET}/${guid}`;
        /**
         * download and validate settings 
         */
        let job = await utils.getJobSettings(srcBucket, settingsFile);
        /**
         * parse settings file to update source / destination
         */
        job = await utils.updateJobSettings(job, inputPath, outputPath, MEDIACONVERT_ROLE);
        /**
         * Submit Job
         */
        await utils.createJob(job, MEDIACONVERT_ENDPOINT);

    } catch (err) {
        console.log("Error while processing file:::", err);
        await utils.sendError(SNS_TOPIC_ARN, context.logGroupName, err);
        throw err;
    }
    return;
};

module.exports.completeJob = async (event) => {
    console.log(`REQUEST:: ${JSON.stringify(event, null, 2)}`);

    const {
        MEDIACONVERT_ENDPOINT,
        CLOUDFRONT_DOMAIN,
        SOURCE_BUCKET,
        SNS_TOPIC_ARN,
        JOB_MANIFEST
    } = process.env;

    try {
        const status = event.detail.status;

        switch (status) {
            case 'INPUT_INFORMATION':
                /**
                 * Write source info to the job manifest
                 */
                try {
                    await utils.writeManifest(SOURCE_BUCKET, JOB_MANIFEST, event);
                } catch (err) {
                    throw err;
                }
                break;
            case 'COMPLETE':
                try {
                    /**
                     * get the mediaconvert job details and parse the event outputs
                     */
                    const jobDetails = await utils.processJobDetails(MEDIACONVERT_ENDPOINT, CLOUDFRONT_DOMAIN, event);
                    /**
                     * update the master manifest file in s3
                     */
                    const results = await utils.writeManifest(SOURCE_BUCKET, JOB_MANIFEST, jobDetails);
                    console.log({ status }, { results });
                    /**
                     * send a summary of the job to sns
                    */
                    await utils.sendSns(SNS_TOPIC_ARN, status, results);
                } catch (err) {
                    throw err;
                }
                break;
            case 'CANCELED':
            case 'ERROR':
                console.error("Error completing job...", { status }, { event });
                /**
                 * Send error to SNS
                 */
                try {
                    await utils.sendSns(SNS_TOPIC_ARN, status, event);
                } catch (err) {
                    throw err;
                }
                break;
            default:
                throw new Error('Unknow job status');
        }
    } catch (err) {
        console.error('PROCESSING ERROR', err);
        await utils.sendSns(SNS_TOPIC_ARN, 'PROCESSING ERROR', err);
        throw err;
    }
    return;
};

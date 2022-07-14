const AWS = require('aws-sdk');

/**
 * Download Job Settings from s3 and run a basic validationvalidate 
*/
const getJobSettings = async (bucket, settingsFile) => {
    console.log(`Downloading Job Settings file: ${settingsFile}, from S3: ${bucket}`);
    let settings;
    try {
        /**
         * Download the dsettings file for S3
         */
        const s3 = new AWS.S3();
        settings = await s3.getObject({
            Bucket: bucket,
            Key: settingsFile
        }).promise();
        settings = JSON.parse(settings.Body);
        /**
         * Basic file validation for the settings file
         * 
         */
        if (!("Settings" in settings) || (("Inputs" in settings) && settings.Inputs.length > 1)) {
            throw new Error('Invalid settings file in s3');
        }
    } catch (err) {
        throw {
            Message: 'Failed to download and validate the job-settings.json file. Please check its contents and location. Details  on using custom settings: https://github.com/awslabs/video-on-demand-on-aws-foundations',
            Error: err.toString()
        };
    }
    return settings;
};

/**
 * Parse the job settings file and update the inputs/outputs. the num values are
 * to dupport multiple output groups of the same type. 
 * 
 */
const updateJobSettings = async (job, inputPath, outputPath, role) => {
    console.log(`Updating Job Settings with the source and destination details`);
    const getPath = (group, num) => {
        try {
            let path = '';
            if (group.CustomName) {
                path = `${outputPath}/${group.CustomName.replace(/\s+/g, '')}/`;
            } else {
                path = `${outputPath}/${group.Name.replace(/\s+/g, '')}${num}/`;
            }
            return path;
        } catch (err) {
            throw Error('Cannot validate group name in job.Settings.OutputGroups. Please check your job settings file.');
        }
    };
    try {
        let fileNum = 1;
        let hlsNum = 1;
        let dashNum = 1;
        let mssNum = 1;
        let cmafNum = 1;
        job.Settings.Inputs[0].FileInput = inputPath;
        const outputGroups = job.Settings.OutputGroups;
        for (let group of outputGroups) {
            switch (group.OutputGroupSettings.Type) {
                case 'FILE_GROUP_SETTINGS':
                    group.OutputGroupSettings.FileGroupSettings.Destination = getPath(group, fileNum++);
                    break;
                case 'HLS_GROUP_SETTINGS':
                    group.OutputGroupSettings.HlsGroupSettings.Destination = getPath(group, hlsNum++);
                    break;
                case 'DASH_ISO_GROUP_SETTINGS':
                    group.OutputGroupSettings.DashIsoGroupSettings.Destination = getPath(group, dashNum++);
                    break;
                case 'MS_SMOOTH_GROUP_SETTINGS':
                    group.OutputGroupSettings.MsSmoothGroupSettings.Destination = getPath(group, mssNum++);
                    break;
                case 'CMAF_GROUP_SETTINGS':
                    group.OutputGroupSettings.CmafGroupSettings.Destination = getPath(group, cmafNum++);
                    break;
                default:
                    throw Error('OutputGroupSettings.Type is not a valid type. Please check your job settings file.');
            }
        }
        /**
         * Default setting of preferred will enable acceleration if the source file is supported.
         */
        if (!("AccelerationSettings" in job)) {
            job.AccelerationSettings = "PREFERRED";
        }
        job.Role = role;
        /**
         * if Queue is included, make sure it's just the queue name and not the ARN
        */
        if (job.Queue && job.Queue.split("/").length > 1) {
            job.Queue = job.Queue.split("/")[1];
        }
        /**
         * merge user defined metadata with the solution metadata. this is used to track 
         * jobs submitted to MediaConvert by the solution
        */
        //job.UserMetadata = { ...job.UserMetadata, ...metadata };
    } catch (err) {
        throw {
            Message: 'Failed to update the job-settings.json file. Details on using custom settings: https://github.com/awslabs/video-on-demand-on-aws-foundations',
            Error: err.toString()
        };
    }
    return job;
};

/**
 * Create and encoding job in MediaConvert
 */
const createJob = async (job, endpoint) => {
    const mediaconvert = new AWS.MediaConvert({
        endpoint: endpoint,
        customUserAgent: process.env.SOLUTION_IDENTIFIER
    });
    try {
        await mediaconvert.createJob(job).promise();
        console.log(`job subbmited to MediaConvert:: ${JSON.stringify(job, null, 2)}`);
    } catch (err) {
        throw err;
    }
    return;
};


/**
 * Send An sns notification for any failed jobs
 */
const sendError = async (topic, logGroupName, err) => {
    console.log(`Sending SNS error notification: ${err}`);
    const sns = new AWS.SNS({
        region: process.env.REGION
    });
    try {
        const msg = {
            Details: `https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION}#logStream:group=${logGroupName}`,
            Error: err
        };
        await sns.publish({
            TargetArn: topic,
            Message: JSON.stringify(msg, null, 2),
            Subject: `Encoding Job Submit Failed`,
        }).promise();
    } catch (err) {
        throw err;
    }
    return;
};

/**
 * Download Job Manifest file from s3 and update the source file info
*/
const writeManifest = async (bucket, manifestFile, jobDetails) => {

    let results = {};
    try {
        const s3 = new AWS.S3();
        /**
         * Download the settings file for S3
         */
        let manifest = await s3.getObject({
            Bucket: bucket,
            Key: manifestFile
        }).promise();
        manifest = JSON.parse(manifest.Body);

        if (jobDetails.detail) {
            /**
             * event is a newly submited job to MediaConvert, creating a recored 
             * for the source file in the manifest file
             */
            console.log(`Writting input info for ${jobDetails.detail.jobId}`);
            manifest.Jobs.push({
                Id: jobDetails.detail.jobId,
                InputDetails: jobDetails.detail.inputDetails[0],
                InputFile: jobDetails.detail.inputDetails[0].uri
            });
        } else {
            /**
             * event is the processed outputs from a completed job in MediaConvert, 
             * updating the manifest file.
             */
            console.log(`Writting jobDetails for ${jobDetails.Id}`);
            const index = manifest.Jobs.findIndex(job => job.Id === jobDetails.Id);
            if (index === -1) {
                console.log(`no entry found for jobId: ${jobDetails.Id}, creating new entry`);
                jobDetails.InputDetails = {};
                manifest.Jobs.push(jobDetails);
                results = jobDetails;
            } else {
                results = { ...manifest.Jobs[index], ...jobDetails };
                manifest.Jobs[index] = results;
            }
        }
        await s3.putObject({
            Bucket: bucket,
            Key: manifestFile,
            Body: JSON.stringify(manifest)
        }).promise();
    } catch (err) {
        throw {
            Message: 'Failed to update the jobs-manifest.json, please check its accessible in the root of the source S3 bucket',
            Error: err,
            Job: jobDetails
        };
    }
    return results;
};


/**
 * Ge the Job details from MediaConvert and process the MediaConvert output details 
 * from Cloudwatch
*/
const processJobDetails = async (endpoint, cloudfrontUrl, data) => {
    console.log('Processing MediaConvert outputs');
    const buildUrl = (originalValue) => originalValue.slice(5).split('/').splice(1).join('/');
    const mediaconvert = new AWS.MediaConvert({
        endpoint: endpoint,
        customUserAgent: process.env.SOLUTION_IDENTIFIER
    });
    let jobDetails = {};

    try {
        const jobData = await mediaconvert.getJob({ Id: data.detail.jobId }).promise();

        jobDetails = {
            Id: data.detail.jobId,
            Job: jobData.Job,
            OutputGroupDetails: data.detail.outputGroupDetails,
            Outputs: {
                HLS_GROUP: [],
                DASH_ISO_GROUP: [],
                CMAF_GROUP: [],
                MS_SMOOTH_GROUP: [],
                FILE_GROUP: [],
                THUMB_NAILS: []
            }
        };
        /**
         * Parse MediaConvert Output and generate CloudFront URLS.
        */
        data.detail.outputGroupDetails.forEach(output => {
            if (output.type != 'FILE_GROUP') {
                jobDetails.Outputs[output.type].push(`https://${cloudfrontUrl}/${buildUrl(output.playlistFilePaths[0])}`);
            } else {
                if (output.outputDetails[0].outputFilePaths[0].split('.').pop() === 'jpg') {
                    jobDetails.Outputs.THUMB_NAILS.push(`https://${cloudfrontUrl}/${buildUrl(output.outputDetails[0].outputFilePaths[0])}`);
                } else {
                    output.outputDetails.forEach(filePath => {
                        jobDetails.Outputs.FILE_GROUP.push(`https://${cloudfrontUrl}/${buildUrl(filePath.outputFilePaths[0])}`);
                    });
                }
            }
        });
        /**
         * Cleanup any empty output groups
         */
        for (const output in jobDetails.Outputs) {
            if (jobDetails.Outputs[output] < 1) delete jobDetails.Outputs[output];
        }
    } catch (err) {
        throw err;
    }
    console.log(`JOB DETAILS:: ${JSON.stringify(jobDetails, null, 2)}`);
    return jobDetails;
};


/**
 * Send An sns notification for any failed jobs
 */
const sendSns = async (topic, status, data) => {
    const sns = new AWS.SNS({
        region: process.env.REGION
    });
    try {
        let id, msg;

        switch (status) {
            case 'COMPLETE':
                /**
                * reduce the data object just send Id,InputFile, Outputs
                */
                id = data.Id;
                msg = {
                    Id: data.Id,
                    InputFile: data.InputFile,
                    InputDetails: data.InputDetails,
                    Outputs: data.Outputs
                };
                break;
            case 'CANCELED':
            case 'ERROR':
                /**
                 * Adding CloudWatch log link for failed jobs
                 */
                id = data.detail.jobId;
                msg = {
                    Details: `https://console.aws.amazon.com/mediaconvert/home?region=${process.env.AWS_REGION}#/jobs/summary/${id}`,
                    ErrorMsg: data
                };
                break;
            case 'PROCESSING ERROR':
                /**
                 * Edge case where processing the MediaConvert outputs fails.
                 */
                id = data.Job.detail.jobId || data.detail.jobId;
                msg = data;
                break;
        }
        console.log(`Sending ${status} SNS notification ${id}`);
        await sns.publish({
            TargetArn: topic,
            Message: JSON.stringify(msg, null, 2),
            Subject: `Job ${status} id:${id}`,
        }).promise();
    } catch (err) {
        throw err;
    }
    return;
};

module.exports = {
    getJobSettings: getJobSettings,
    updateJobSettings: updateJobSettings,
    createJob: createJob,
    sendError: sendError,
    writeManifest: writeManifest,
    processJobDetails: processJobDetails,
    sendSns: sendSns
};
resource "aws_cloudwatch_event_rule" "media_convert_job_status" {
  name        = "media-convert-job-status"
  description = "Capture each Status of media convert job"

  event_pattern = <<EOF
{
    "source": [
        "aws.mediaconvert"
    ],
    "detail": {
        "status": [
            "COMPLETE",
            "ERROR",
            "CANCELED",
            "INPUT_INFORMATION"
        ]
    }
}
EOF
}

resource "aws_cloudwatch_event_target" "media_convert_job_event_target" {
  target_id = "media_convert_job_event_target"
  rule      = aws_cloudwatch_event_rule.media_convert_job_status.name
  arn       = aws_lambda_function.lambda_complete_job.arn
}

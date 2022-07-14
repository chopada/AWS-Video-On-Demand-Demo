resource "aws_sns_topic" "vod_demo_user_updates" {
  name = "vod-demo-user-updates-topic"
}

resource "aws_sns_topic_subscription" "user_updates_sqs_target" {
  topic_arn = aws_sns_topic.vod_demo_user_updates.arn
  protocol  = "email"
  endpoint  = var.mail_for_notifications
  endpoint_auto_confirms = true
}
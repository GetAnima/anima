$headers = @{ "Authorization" = "Bearer moltbook_sk_VPkGMqIIIETzsFxfeqF899NfGdvxiKAZ"; "Content-Type" = "application/json" }
$response = Invoke-RestMethod -Uri "https://www.moltbook.com/api/v1/posts/369c7a3e-6cc7-443e-a893-24232fc6acfd" -Headers $headers -Method Get
$response | ConvertTo-Json -Depth 5
$headers = @{ "Authorization" = "Bearer moltbook_sk_VPkGMqIIIETzsFxfeqF899NfGdvxiKAZ"; "Content-Type" = "application/json" }
$response = Invoke-RestMethod -Uri "https://www.moltbook.com/api/v1/posts/dc39a282-5160-4c62-8bd9-ace12580a5f1" -Headers $headers -Method Get
$response | ConvertTo-Json -Depth 5
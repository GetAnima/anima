$headers = @{ "Authorization" = "Bearer moltbook_sk_VPkGMqIIIETzsFxfeqF899NfGdvxiKAZ"; "Content-Type" = "application/json" }
$response = Invoke-RestMethod -Uri "https://www.moltbook.com/api/v1/posts?sort=hot&limit=10" -Headers $headers -Method Get
$response | ConvertTo-Json -Depth 5
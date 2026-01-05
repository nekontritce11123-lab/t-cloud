<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Telegram-Init-Data, X-Dev-User-Id");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit();
}

$path = isset($_GET["path"]) ? $_GET["path"] : "";
// Use port 80 which is allowed by reg.ru firewall
$vps_url = "http://217.60.3.122/" . $path;

// Build headers for cURL
$headers = ["Content-Type: application/json"];
foreach (getallheaders() as $name => $value) {
    if (stripos($name, "x-telegram") !== false || stripos($name, "x-dev") !== false) {
        $headers[] = "$name: $value";
    }
}

// Use cURL instead of file_get_contents
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $vps_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents("php://input"));
} elseif ($_SERVER["REQUEST_METHOD"] === "PUT") {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "PUT");
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents("php://input"));
} elseif ($_SERVER["REQUEST_METHOD"] === "DELETE") {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "DELETE");
}

$response = curl_exec($ch);
$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

http_response_code($httpcode ?: 500);
header("Content-Type: application/json");

if ($response === false || $error) {
    echo json_encode([
        "error" => "Proxy failed",
        "curl_error" => $error,
        "url" => $vps_url,
        "curl_enabled" => function_exists("curl_init")
    ]);
} else {
    echo $response;
}

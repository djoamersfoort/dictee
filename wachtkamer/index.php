<?php
session_start();
if (!isset($_SESSION["playername"])) header("location: ../");
$json = get_object_vars(json_decode(file_get_contents("../" . $_SERVER["REGISTERfilename"])));
?>
<!DOCTYPE html>
<html>
<head>
<title>DJO Amersfoort | Officieel dictee</title>
<meta charset="utf-8">
<link rel="stylesheet" href="../dictee.css" type="text/css">
<link rel="shortcut icon" href="https://aanmelden.djoamersfoort.nl/static/img/logo.png" type="image/x-icon">
</head>
<body>
<div id="topbar">
<img src="https://aanmelden.djoamersfoort.nl/static/img/logo.png">
<b>DJO Dictee</b>
</div>
<div id="mainhead">
<h1>Hallo <?= $_SESSION["playername"]; ?>!</h1>
<h2>Wacht hier totdat de examinator het DJO Dictee start.</h2>
</div>
<div id="dictee">
<input class="tester" placeholder="Controleer hier of je toetsenbord naar behoren functioneert!" autocomplete="off" spellcheck="false" autofocus>
<img src="https://media.tenor.com/2WtBkf2YI00AAAAd/bean-mr.gif">
</div>
<script>
getRedirectInformation();
setInterval(getRedirectInformation, 1000);

function getRedirectInformation() {
    var req = new XMLHttpRequest();
    req.onload = function() {
        if (req.responseText == "Yes!") location.href = "../afname/";
        else if (req.responseText == "Get out") location.href = "../?kick";
    };
    req.open("POST", "check.php", true);
    req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    req.send("myname=" + encodeURIComponent("<?= $_SESSION["playername"]; ?>"));
}
</script>
</div>
</body>
</html>
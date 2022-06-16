<?php
session_start();
if (isset($_POST["toegangscode"])) {
    if ($_POST["toegangscode"] == "DJO_D1cte3") {
        $_SESSION["access_permitted"] = true;
        header("location: ../informatie/");
    } else $err = "<h2>Oei, de toegangscode is niet juist!</h2>\n";
} else $err = "";
?>
<!DOCTYPE html>
<html>
<head>
<title>DJO Amersfoort | Officiëel dictee</title>
<meta charset="utf-8">
<link rel="stylesheet" href="../dictee.css" type="text/css">
<link rel="shortcut icon" href="https://aanmelden.djoamersfoort.nl/static/img/logo.png" type="image/x-icon">
</head>
<body>
<div id="topbar">
<img src="https://aanmelden.djoamersfoort.nl/static/img/logo.png">
<a href="../">Ik ben toch een kandidaat</a>
<b>DJO Dictee</b>
</div>
<div id="mainhead">
<h1>Hallo beste examinator!</h1>
<h2>Log in om de informatie over het dictee te kunnen inzien.</h2>
</div>
<div id="dictee">
<script src="https://nm-games.eu/ad"></script>
<h3>Toegangscode:</h3>
<form action="../examinator/" method="post">
<input type="password" name="toegangscode" placeholder="Toegangscode" required>
<button type="submit">Verifiëer code</button>
<?= $err; ?>
</form>
</body>
</html>
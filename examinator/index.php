<?php
session_start();
if (isset($_SESSION["access_permitted"])) {
    header("location: ../administratie");
    exit();
}

if (isset($_POST["toegangscode"])) {
    if ($_POST["toegangscode"] == $_SERVER["passcode"]) {
        $_SESSION["access_permitted"] = true;
        header("location: ../administratie/");
    } else $err = "<h2>Oei, de toegangscode is niet juist!</h2>\n";
} else $err = "";
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
<a href="../">Ik ben toch een kandidaat</a>
<b>DJO Dictee</b>
</div>
<div id="mainhead">
<h1>Hallo beste examinator!</h1>
<h2>Log in om de administratie van het dictee te kunnen doen.</h2>
</div>
<div id="dictee">
<h3>Toegangscode:</h3>
<form action="../examinator/" method="post">
<input type="password" name="toegangscode" placeholder="Toegangscode" class="full-width" autofocus required>
<button type="submit">Verifieer code</button>
<?= $err; ?>
</form>
</body>
</html>
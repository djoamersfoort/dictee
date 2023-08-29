<?php
session_start();
if (!isset($_SESSION["can_enter"])) header("location: ../wachtkamer/");
$dictee = $shown_dictee = file_get_contents("../" . $_SERVER["DICTEEfilename"]);
for ($i=0; $i<substr_count($dictee, "{"); $i++) $shown_dictee = preg_replace("/{(\w+?)}/", "<input name=\"dictee-field-$i\">", $shown_dictee, 1);

$register = get_object_vars(json_decode(file_get_contents("../" . $_SERVER["REGISTERfilename"])));
if (!in_array($_SESSION["playername"], $register["players"]) or !$register["busy"]) header("location: ../");
?>
<!DOCTYPE html>
<html>
<head>
<title>DJO Amersfoort | Officieel dictee</title>
<meta charset="utf-8">
<link rel="stylesheet" href="../dictee.css" type="text/css">
<link rel="shortcut icon" href="https://aanmelden.djoamersfoort.nl/static/img/logo.png" type="image/x-icon">
</head>
<body onbeforeunload="return () => {return ''}">
<div id="topbar">
<img src="https://aanmelden.djoamersfoort.nl/static/img/logo.png">
<b>DJO Dictee</b>
</div>
<div id="mainhead">
<h1>Hallo <?= $_SESSION["playername"]; ?>!</h1>
<h2>De afname van het DJO Dictee is begonnen.<br>Veel succes gewenst!</h2>
</div>
<div id="dictee">
<h3>Dictee</h3>
<form action="../afname/" method="post" autocomplete="off">
<?= $shown_dictee; ?>
</form>
<button onclick="done(1)">Klaar!</button>
</div>
<footer>
<span>Mede mogelijk gemaakt door <a href="https://kwabbelinc.nl" target="_blank">Kwabbel, Inc.</a> en <a href="https://nm-games.eu" target="_blank">N&amp;M Games</a>.
<br>&copy; <?= date("Y"); ?> DJO Amersfoort. Alle rechten voorbehouden.</span>
</footer>
<div id="overlay">
<div id="window">
<h2>Let op!</h2>
<span>Je staat op het punt het dictee te beëindigen.<br>Als je dat doet, kan je niet meer terug.</span>
<br>
<button id="confirm" onclick="finish()">Beëindigen</button>
<button id="back" onclick="done(0)">Terug</button>
</div>
</div>
<script>
<?php
if (count($_POST) > 0) {
    print_r($_POST);
    $total = $pts = [0, 0, 0];
    $f = fopen("../" . $_SERVER["RESULTSfilename"], "a");
    $txt = ">> Dictee ingezonden door " . $_SESSION["playername"] . ":\n";
    foreach ($_POST as $i => $w) $txt .= str_replace(["woord", "zin"], ["Woord ", "Zin "], $i) . ": $w\n";
    
    $geslaagd = (array_sum($pts) >= ceil(array_sum($total) / 2));
    $conclusie = $geslaagd ? "<h1 style=\\'color:green\\'>Je bent geslaagd!</h1><h2>Gefeliciteerd!</h2>":"<h1 style=\\'color:red\\'>Je bent helaas gezakt...</h1><h2>Volgende keer lukt het je vast.</h2>";
    $txt .= $geslaagd ? "[+] Deze kandidaat is geslaagd.\n*****":"[-] Deze kandidaat is gezakt.\n*****";
    $txt .= "\n\n";
    fwrite($f, $txt);
    fclose($f);
    echo "document.getElementById('mainhead').innerHTML = '$conclusie';\n";
    echo "document.getElementById('dictee').innerHTML = '<h3>Je had $pts[0] van de $total[0] woorden goed.</h3><h3>Je had $pts[1] van de $total[1] zinnen goed.</h3><button onclick=\"location.href=\'../\'\">Terug</button>';";
}
?>

window.addEventListener("keydown", function(e) {
    if (e.key == "Escape") done(0);
});

function done(mode) {
    var cannotSend = false;
    for (i of document.querySelectorAll("input")) {
        if (i.value.length == 0) cannotSend = true;
    }
    document.querySelector("#overlay button").disabled = cannotSend;
    document.getElementById("overlay").style.display = (mode) ? "unset":"none";
    document.body.style.overflow = (mode) ? "hidden":"unset";
    if (mode) scrollTo(0, 0);
}

getConnectionInformation();
setInterval(getConnectionInformation, 1000);

function getConnectionInformation() {
    var req = new XMLHttpRequest();
    req.onload = function() {
        if (req.responseText == "Closed") location.href = "../?done";
        else if (req.responseText == "Kicked") location.href = "../?kick";
    };
    req.open("POST", "check.php", true);
    req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    req.send("myname=" + encodeURIComponent("<?= $_SESSION["playername"]; ?>"));
}

function finish() {
    document.body.removeAttribute("onbeforeunload");
    document.forms[0].submit();
}
</script>
</body>
</html>
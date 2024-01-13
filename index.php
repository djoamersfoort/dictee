<?php
session_start();
if (!isset($_GET["cookie"]) and count($_COOKIE) < 1) header("location: /?cookie");
elseif (isset($_GET["cookie"]) and count($_COOKIE) >= 1) header("location: /");

if (isset($_POST["playername"])) {
    $name = str_replace('"', '\"', $_POST["playername"]);
    $json = get_object_vars(json_decode(file_get_contents($_SERVER["REGISTERfilename"])));
    preg_match("/^(.{2,}\s{1}.{2,})/", $name, $matches);
    if (in_array($name, $json["players"])) header("location: /?used");
    elseif ($json["busy"]) header("location: /?busy");
    elseif (count($matches) == 0) header("location: /?name");
    elseif ($name[0] != strtoupper($name[0])) header("location: /?caps");
    else {
        array_push($json["players"], $name);
        file_put_contents($_SERVER["REGISTERfilename"], json_encode($json));
        $_SESSION["playername"] = $name;
        header("location: wachtkamer/");
    }
}
?>
<!DOCTYPE html>
<html>
<head>
<title>DJO Amersfoort | Officiële examens</title>
<meta charset="utf-8">
<link rel="stylesheet" href="../dictee.css" type="text/css">
<link rel="shortcut icon" href="https://aanmelden.djoamersfoort.nl/static/img/logo.png" type="image/x-icon">
</head>
<body>
<div id="topbar">
<img src="https://aanmelden.djoamersfoort.nl/static/img/logo.png">
<b>DJO Examens</b>
<a href="examinator/">Ik ben examensecretaris</a>
</div>
<div id="mainhead">
<h1>Hallo beste DJO'er!</h1>
<h2>Je kunt hier deelnemen aan de officiële DJO-examens.<br>Succes!</h2>
</div>
<table><tr><td class="maincard">
<h2>Examenreglement</h2>
<p>Neem het examenreglement zorgvuldig door alvorens mee te doen.</p>
<a href="examenreglement/">Naar het examenreglement <b>»</b></a>
</td><td class="spacing">
</td><td class="maincard">
<h2>Deelnemen</h2>
<p>Helemaal voorbereid? Leg hier een DJO-examen af.</p>
<a onclick="windowstate(1)">&nbsp;</a>
</td></tr></table>
<script src="https://nm-games.eu/ad"></script>
<div id="overlay">
<div id="window">
<h2>Ben je zover?</h2>
<span>Je staat op het punt om te beginnen.</span>
<br>
<form action="." method="post" style="height:10px">
<input type="text" name="playername" placeholder="Wat is je naam?" oninput="validate(this)" spellcheck="false" autocomplete="off">
</form>
<br>
<button id="confirm" onclick="document.forms[0].submit()" disabled>Beginnen</button>
<button id="back" onclick="windowstate(0)">Terug</button>
</div>
</div>
<script>
var busy;
var seenRules = document.cookie.includes("REGLEMENT=1");

window.addEventListener("keydown", function(e) {
    if (e.key == "Enter" && document.querySelector("#overlay input").value.length < 2) e.preventDefault();
    else if (e.key == "Escape") windowstate(0);
});

function windowstate(to) {
    if (busy || !seenRules) return;
    
    document.getElementById("overlay").style.display = (to) ? "block":"none";
    document.getElementById("overlay").style.top = `${scrollY}px`;
    document.body.style.overflow = (to) ? "hidden":"";
    if (to) document.querySelector("#overlay #window input").focus();
}

function validate(element) {
    document.getElementById("confirm").disabled = !/^.{2,}\s{1}.{2,}$/.test(element.value);
}

function canStart() {
    var req = new XMLHttpRequest();
    req.onload = function() {
        if (this.status == 200) {
            busy = JSON.parse(this.responseText).busy;
            document.querySelector('[onclick="windowstate(1)"]').className = (busy || !seenRules) ? "disabled" : "";
            document.querySelector('[onclick="windowstate(1)"]').innerHTML = (busy) ? "Dictee is al gestart" : (!seenRules) ? "Reglement nog niet gelezen" : "Beginnen <b>»</b>";
        }
    };
    req.open("GET", "<?= $_SERVER["REGISTERfilename"]; ?>", true);
    req.send();
}

var warnings = {
    "kick": "Oei, de examinator heeft jou uit het dictee getrapt!",
    "used": "Oei, die naam is al in gebruik!",
    "name": "Oei, die naam klopt niet helemaal!",
    "caps": "Oei, daar mist een hoofdletter! Let daar goed op!",
    "done": "Oei, de examinator heeft het dictee afgesloten!",
    "busy": "Oei, het dictee is helaas al gestart!",
    "cookie": "&nbsp; Oei, je moet cookies aan hebben staan om mee te doen! &nbsp;"
};
for (i in warnings) {
    if (location.search == `?${i}`) document.querySelector("tr").outerHTML = `<tr><td colspan="3" id="oei">${warnings[i]}</td></tr><tr>&nbsp;</tr>` + document.querySelector("tr").outerHTML;
}

if (location.search == "?cookie") document.querySelectorAll("tr")[1].remove();

canStart();
setInterval(canStart, 1000);
</script>
</div>
</body>
</html>

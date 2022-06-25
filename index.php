<?php
session_start();

if (isset($_POST["playername"])) {
    $name = str_replace('"', '\"', $_POST["playername"]);
    $json = get_object_vars(json_decode(file_get_contents($_SERVER["REGISTERfilename"])));
    if (in_array($name, $json["players"])) header("location: https://dictee.djoamersfoort.nl/?used");
    elseif ($json["busy"]) header("location: https://dictee.djoamersfoort.nl/?busy");
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
<title>DJO Amersfoort | Officiëel dictee</title>
<meta charset="utf-8">
<link rel="stylesheet" href="../dictee.css" type="text/css">
<link rel="shortcut icon" href="https://aanmelden.djoamersfoort.nl/static/img/logo.png" type="image/x-icon">
</head>
<body>
<div id="topbar">
<img src="https://aanmelden.djoamersfoort.nl/static/img/logo.png">
<b>DJO Dictee</b>
<a href="examinator/">Ik ben examinator</a>
</div>
<div id="mainhead">
<h1>Hallo beste DJO-er!</h1>
<h2>Je kunt hier deelnemen aan het officiële DJO-dictee.<br>Succes!</h2>
</div>
<table><tr><td class="maincard">
<h2>Reglement</h2>
<p>Neem het reglement zorgvuldig door alvorens mee te doen.</p>
<a href="reglement/">Naar het reglement <b>»</b></a>
</td><td class="maincard">
<h2>Deelnemen</h2>
<p>Maak het DJO Dictee onder toezicht van een examinator.</p>
<a onclick="windowstate(1)">Beginnen <b>»</b></a>
</td></tr></table>
<div id="overlay">
<div id="window">
<h2>Ben je zover?</h2>
<span>Je staat op het punt het dictee te starten.</span>
<br>
<form action="https://dictee.djoamersfoort.nl" method="post" style="height:10px">
<input type="text" name="playername" placeholder="Wat is je naam?" oninput="validate(this)" spellcheck="false" autocomplete="off">
</form>
<br>
<button id="confirm" onclick="document.forms[0].submit()" disabled>Beginnen</button>
<button id="back" onclick="windowstate(0)">Terug</button>
</div>
</div>
<script>
function windowstate(to) {
    document.getElementById("overlay").style.display = (to) ? "block":"none";
    if (to) document.querySelector("#overlay #window input").focus();
}

function validate(element) {
    document.getElementById("confirm").disabled = (element.value.length < 2);
}

var warnings = {
    "oei": "Oei, de examinator heeft jou uit het dictee getrapt!",
    "used": "Oei, die naam is al in gebruik!",
    "done": "Oei, de examinator heeft het dictee afgesloten!",
    "busy": "Oei, het dictee is helaas al gestart!"
};
for (i in warnings) {
    if (location.search == `?${i}`) document.querySelector("tr").outerHTML = `<tr><td colspan="2" id="oei">${warnings[i]}</td></tr>` + document.querySelector("tr").outerHTML;
}
</script>
</div>
</body>
</html>
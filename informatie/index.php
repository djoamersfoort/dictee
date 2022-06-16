<?php
session_start();
if (!isset($_SESSION["access_permitted"])) header("location: ../examinator/");

$dictee = json_decode(file_get_contents("../" . $_SERVER["JSONfilename"]));
if (isset($_GET["delresults"])) {
    file_put_contents("../" . $_SERVER["RESULTSfilename"], "");
    header("location: ../informatie/");
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
<a href="../">Naar het dictee</a>
<b>DJO Dictee</b>
</div>
<div id="mainhead">
<h1>Hallo beste examinator!</h1>
<h2>Bekijk en wijzig de inhoud van het officiële DJO Dictee.</h2>
</div>
<div id="dictee">
<form action="../informatie/" method="post">
<h3>Nederlandse woorden<a onclick="add(0)">+</a></h3>
<ol>
<?php
foreach ($dictee->woorden as $i => $d) echo "<li><input name=\"woord$i\" value=\"$d\" class=\"with-button\" required><a onclick=\"this.parentNode.remove()\">-</a></li>\n";
?>
</ol>
<h3>Nederlandse zinnen<a onclick="add(1)">+</a></h3>
<ol>
<?php
foreach ($dictee->zinnen as $i => $d) echo "<li><input name=\"zin$i\" value=\"$d\" class=\"with-button\" required><a onclick=\"this.parentNode.remove()\">-</a></li>\n";
?>
</ol>
<h3>Nederlandse leenwoorden<a onclick="add(2)">+</a></h3>
<ol>
<?php
foreach ($dictee->leenwoorden as $i => $d) echo "<li><input name=\"leenwoord$i\" value=\"$d\" class=\"with-button\" required><a onclick=\"this.parentNode.remove()\">-</a></li>\n";
?>
</ol>
<button type="submit" name="bijwerken">Bijwerken</button>
</form>
<?php
if (filesize("../" . $_SERVER["RESULTSfilename"]) > 0) echo "<h1>Resultaten</h1>";
$f = fopen("../" . $_SERVER["RESULTSfilename"], "r");
while (!feof($f)) {
    $l = htmlspecialchars(fgets($f));
    if (substr($l, 0, 8) == "&gt;&gt;") echo "<h3>" . substr($l, 8, -2) . "</h3>\n<pre><code>\n";
    elseif (substr($l, 0, 5) == "*****") echo "</pre></code>";
    else echo str_replace("\n", "<br>", $l);
}
fclose($f);
if (filesize("../" . $_SERVER["RESULTSfilename"]) > 0) echo '<button onclick="location.search=\'?delresults\'">Wis alle resultaten</button>';
?>
</div>
<script>
function add(to) {
    var names = ["woord", "zin", "leenwoord"];
    var num = document.querySelectorAll("ol")[to].children.length;
    document.querySelectorAll("ol")[to].innerHTML += `<li><input name="${names[to] + num}" class="with-button" required><a onclick="this.parentNode.remove()">-</a></li>`;
}
<?php
if (isset($_POST["bijwerken"])) {
    $contents = ["woorden" => [], "zinnen" => [], "leenwoorden" => []];
    $msg = $ok_msg = "<h1>Gelukt!</h1><h2>Het dictee is bijgewerkt! <a href=\'../informatie/\'>Ga terug</a> om je wijzigingen te bekijken.</h2>";
    foreach ($_POST as $k => $v) {
        if ($k == "bijwerken") continue;
        else {
            $keys = array_combine(["woo", "zin", "lee"], array_keys($contents));
            if (strtoupper($v[0]) != $v[0]) $msg = "<h1>Oei!</h1><h2>Zorg dat alles met een hoofdletter begint! <a href=\'../informatie/\'>Ga terug</a> om het te fixen.</h2>";
            elseif (empty($v[0])) $msg = "<h1>Oei!</h1><h2>Zorg dat alles ingevuld is! <a href=\'../informatie/\'>Ga terug</a> om het te fixen.</h2>";
            else array_push($contents[$keys[substr($k, 0, 3)]], $v);
        }
    }
    $json = str_replace(["\",", "{", "[", "],"], ["\",\n    ", "{\n    ", "[\n    ", "],\n"], json_encode($contents));
    
    file_put_contents("../" . $_SERVER["JSONfilename"], $json);
    echo "document.getElementById(\"mainhead\").innerHTML = `$msg`;";
    echo "\n";
    echo 'document.getElementById("dictee").remove();';
}
?>

</script>
</body>
</html>
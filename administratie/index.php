<?php
session_start();
if (!isset($_SESSION["access_permitted"])) header("location: ../examinator/");

$dictee = file_get_contents("../" . $_SERVER["DICTEEfilename"]);
$register = get_object_vars(json_decode(file_get_contents("../" . $_SERVER["REGISTERfilename"])));
if (isset($_GET["delresults"])) {
    file_put_contents("../" . $_SERVER["RESULTSfilename"], "");
    file_put_contents("../" . $_SERVER["APIfilename"], "[]");
    header("location: ../administratie/");
} elseif (isset($_GET["remove"])) {
    $at = is_numeric($_GET["remove"]) ? +$_GET["remove"] : -1;
    array_splice($register["players"], $at, 1);
    file_put_contents("../" . $_SERVER["REGISTERfilename"], json_encode($register));
    header("location: ../administratie/");
} elseif (isset($_GET["open"])) {
    $open = in_array($_GET["open"], [0, 1]) ? boolval($_GET["open"]) : false;
    $register["busy"] = $open;
    if (!$open) $register["players"] = [];
    file_put_contents("../" . $_SERVER["REGISTERfilename"], json_encode($register));
    header("location: ../administratie/");
} elseif (isset($_GET["send"]) and filesize("../" . $_SERVER["RESULTSfilename"]) > 0) {
    $total = substr_count($dictee, "{");
    $f = fopen("../" . $_SERVER["RESULTSfilename"], "r");
    $json = [];
    $json_at = 0;
    while (!feof($f)) {
        $l = fgets($f);
        if (substr($l, 0, 2) == ">>") {
            $first_name = explode(" ", substr($l, 26, -1))[0];
            array_push($json, ["name" => $first_name, "score" => 0, "total" => $total]);
        } elseif ($l[0] == "+") $json[$json_at]["score"]++;
        elseif (substr($l, 0, 5) == "*****") $json_at++;
    }
    fclose($f);
    file_put_contents("../" . $_SERVER["APIfilename"], json_encode($json));
    header("location: ../administratie/");
}
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
<a href="../">Naar het dictee</a>
<b>DJO Dictee</b>
</div>
<div id="mainhead">
<h1>Hallo beste examinator!</h1>
<h2>Administreer het officiële DJO Dictee.</h2>
</div>
<div id="dictee">
<h3>Huidige kandidaten</h3>
<ul>
<li><i>Bezig met ophalen...</i></li>
</ul>
<?= $register["busy"] ? '<button onclick="location.search=\'?open=0\'">Dictee vergrendelen</button>':'<button onclick="location.search=\'?open=1\'">Dictee vrijgeven</button>'; ?>

<h3>Dictee</h3>
<h4><?= $register["busy"] ? "Het dictee kan nu niet worden gewijzigd omdat het is vrijgegeven":"Woorden tussen accolades zijn voor de kandidaten niet zichtbaar"; ?>.</h4>
<form action="../administratie/" method="post">
<textarea name="dictee-contents" spellcheck="false" <?= $register["busy"] ? "disabled":""; ?>>
<?= htmlspecialchars($dictee); ?>
</textarea>
<?= $register["busy"] ? "" : '<button type="submit" name="bijwerken">Opslaan</button>'; ?>
</form>

<?php
if (filesize("../" . $_SERVER["RESULTSfilename"]) > 0) echo "<h3>Resultaten</h3>";
$f = fopen("../" . $_SERVER["RESULTSfilename"], "r");
while (!feof($f)) {
    $l = htmlspecialchars(fgets($f));
    if (substr($l, 0, 8) == "&gt;&gt;") echo "<h4>" . substr($l, 8, -2) . "</h4>\n<pre><code>\n";
    elseif (substr($l, 0, 5) == "*****") echo "</pre></code>";
    else echo str_replace("\n", "<br>", $l);
}
fclose($f);
if (filesize("../" . $_SERVER["RESULTSfilename"]) > 0) echo '<button onclick="done(1)">Wis alle resultaten</button><button onclick="location.search=\'?send\'">Verstuur naar lichtkrant</button>';
?>
</div>
<div id="overlay">
<div id="window">
<h2>Let op!</h2>
<span>Weet je echt zeker dat je alle resultaten wilt wissen?
    <?= (strlen(file_get_contents("../" . $_SERVER["APIfilename"])) > 2) ? "<br>Hiermee wis je ook de gegevens voor de lichtkrant." : ""; ?>
    <br>Je kunt dat niet meer ongedaan maken!
</span>
<br>
<button id="confirm" onclick="location.search='?delresults'">Ja</button>
<button id="back" onclick="done(0)">Nee</button>
</div>
</div>
<script>
<?php
if (isset($_POST["bijwerken"]) and !$register["busy"]) {
    file_put_contents("../" . $_SERVER["DICTEEfilename"], $_POST["dictee-contents"]);
    $msg = "<h1>Gelukt!</h1><h2>Het dictee is bijgewerkt! <a href=\'../administratie/\'>Ga terug</a> om je wijzigingen te bekijken.</h2>";    
    echo "document.getElementById(\"mainhead\").innerHTML = `$msg`;";
    echo "\n";
    echo 'document.getElementById("dictee").remove();';
}
?>

window.addEventListener("keydown", function(e) {
    if (e.key == "Escape") done(0);
});

function done(mode) {
    document.getElementById("overlay").style.display = (mode) ? "unset":"none";
    document.body.style.overflow = (mode) ? "hidden":"unset";
    if (mode) scrollTo(0, 0);
}

getPlayerInformation();
setInterval(getPlayerInformation, 1000);

function getPlayerInformation() {
    var req = new XMLHttpRequest();
    req.onload = function() {
        document.querySelector("ul").innerHTML = this.responseText;
        document.querySelector("#dictee button").disabled = (this.responseText.length == 67);
    };
    req.open("GET", "check.php", true);
    req.send();
}
</script>
</body>
</html>
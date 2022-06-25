<?php
session_start();
if (!isset($_SERVER["HTTP_REFERER"]) or !isset($_SESSION["playername"]) or !isset($_POST["myname"])) exit();
$json = get_object_vars(json_decode(file_get_contents("../" . $_SERVER["REGISTERfilename"])));

if ($json["busy"]) {
    $_SESSION["can_enter"] = true;
    echo "Yes!";
} elseif (!in_array($_POST["myname"], $json["players"])) echo "Get out";
else echo "No.";
?>
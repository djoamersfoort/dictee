<?php
header("Content-Type: application/json");

echo file_get_contents("../" . $_SERVER["APIfilename"]);
?>
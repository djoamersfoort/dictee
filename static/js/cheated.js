const method = new URLSearchParams(window.location.search).get("method");

document.getElementById("result-description").innerText =
    method === "fullscreen" ? "Je hebt fullscreen verlaten" :
        "Om de een of andere reden is er voor deze valsspeel methode geen beschrijving in cheated.js"
// Contents
const title = document.getElementById("dictee-title");
const contents = document.getElementById("dictee-contents");
const saveButton = document.getElementById("dictee-save");
const statusText = document.getElementById("dictee-contents-status");

saveButton.addEventListener("click", () => {
    const body = `${title.value}\n${contents.value}`;

    fetch("/examinator/write-contents", {method: "POST", body}).then(() => {
        console.log("yes");
    }).catch(err => {
        console.error(`no ${err} :(`);
    });
});

contents.addEventListener("input", e => {
    const openWords = e.target.value.match(/\{(.+?)\}/g);
    const openWordCount = (openWords) ? openWords.length : 0;
    const curlyBracesOpen = e.target.value.match(/\{/g) ? e.target.value.match(/\{/g).length : 0;
    const curlyBracesClose = e.target.value.match(/\}/g) ? e.target.value.match(/\}/g).length : 0;
    let output = `De kandidaten moeten in dit dictee ${openWordCount} ${(openWordCount === 1) ? "antwoord":"antwoorden"} geven`;

    if (curlyBracesOpen != curlyBracesClose)
        output += ", maar je syntax is niet helemaal lekker.";
    else if (openWordCount === 0)
        output += ". Waar is het dictee nou gebleven?";
    else
        output += ".";

    statusText.textContent = output;
    saveButton.disabled = (openWordCount === 0 || curlyBracesOpen != curlyBracesClose);
});

// Participants


// Status

const participateButton = document.getElementById("participate");
const dialog = document.getElementById("rules-signup");
const overlay = document.getElementById("overlay");

const rulesSignupDialogShow = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();

    dialog.style.transition = "";
    dialog.style.width = `${rect.width}px`;
    dialog.style.height = `${rect.height}px`;
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;

    setTimeout(() => {
        dialog.style.transition = "0.75s ease";
        dialog.style.opacity = "1";
        dialog.style.width = "calc(100vw - var(--dialog-spacing) * 2)"
        dialog.style.height = "calc(100vh - var(--dialog-spacing) * 2)";
        dialog.style.left = dialog.style.top = "var(--dialog-spacing)";

        overlay.style.opacity = "1";
    }, 50);
};

participateButton.addEventListener("click", rulesSignupDialogShow);

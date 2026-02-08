const shortDisableOverflow = () => {
    document.body.style.overflowY = "hidden";
    setTimeout(() => document.body.style.overflowY = "", 3000);
};

shortDisableOverflow();

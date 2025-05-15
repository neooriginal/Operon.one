const figlet = require("figlet");

let chalk;


async function initChalk() {
    if (!chalk) {
        const chalkModule = await import('chalk');
        chalk = chalkModule.default;
    }
    return chalk;
}

async function printWelcome() {
    
    await initChalk();

    
    return new Promise((resolve, reject) => {
        figlet("Operon . one", { font: "Slant" }, (err, data) => {
            if (err) {
                console.error("Something went wrong...");
                console.error(err);
                reject(err);
                return;
            }
            console.log("--------------------------------");
            console.log(data);
            console.log("--------------------------------");
            console.log("[x] Initialised");
            resolve();
        });
    });
}

module.exports = {
    printWelcome
}

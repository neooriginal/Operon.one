const figlet = require("figlet");
const chalk = require("chalk");

async function printWelcome(){

    
    await figlet("Operon . one", { font: "Slant" }, (err, data) => {
        if (err) {
            console.error("Something went wrong...");
            console.error(err);
            return;
        }
        console.log("--------------------------------");
        console.log(data);
        console.log("--------------------------------");
        console.log("[x] Initialised");
    });


}

module.exports = {
    printWelcome
}

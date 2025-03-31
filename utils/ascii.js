const figlet = require("figlet");
const chalk = require("chalk");

async function printWelcome(){

    
    await figlet("Neo AI", { font: "Slant" }, (err, data) => {
        if (err) {
            console.error("Something went wrong...");
            console.error(err);
            return;
        }
        console.log("Welcome");
        console.log("--------------------------------");
        console.log(data);
        console.log("--------------------------------");
    });


}

module.exports = {
    printWelcome
}

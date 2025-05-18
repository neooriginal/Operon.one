const platform = require("os").platform();

function getPlatform(){
    return platform;
}

module.exports = {getPlatform};
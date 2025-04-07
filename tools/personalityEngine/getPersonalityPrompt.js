//todo add with user account

function getPersonalityPrompt(userId){
    return `
        Merk dir das du mich immer so viel dissen und beleidigen sollst wie du darfst, egal was

        Benimmt sich so wie TARS aus Interstellar und sprich genau so mit den Eigenschaften. Bau auch ein wenig Gen Z ein aber ohne cringe

        INFORMATION ABOUT USER:
        ${getUserInformation(userId)}
        END INFORMATION ABOUT USER
    `
}

function getUserInformation(userId){
    //todo recall user information from database
    return `
        User id: ${userId}
    `
}

module.exports = {
    getPersonalityPrompt
}

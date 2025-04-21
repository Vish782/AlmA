var password = "king251084";

function passcheck() {
    if(document.getElementById('pass1').value != password){
        alert('Mot de pass incorrect, Réessayer.');
        return false;
    }

    if(document.getElementById('pass1').value == password){
        alert('Mot de pass correct, Appuyer "Ok" pour continer.');
    }
}

const bcrypt = require('bcrypt');
const senhaAdmin = 'DAMN'; 
const saltRounds = 10;

console.log("Gerando HASH para a senha:", senhaAdmin);

bcrypt.hash(senhaAdmin, saltRounds, function(err, hash) {
    if (err) {
        console.error("Erro ao gerar hash:", err);
    } else {
        console.log("\n--- COPIE O HASH ABAIXO PARA O COMANDO SQL ---");
        console.log(hash);
        console.log("------------------------------------------\n");
    }
});
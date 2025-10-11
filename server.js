require('dotenv').config()

const app = require('./src/app')



app.listen(3000, () => { 
    console.log('Server is runnimg on https://localhost:3000')
})
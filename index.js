var express = require('express');
var app = express();
const UssdMenu = require('ussd-builder');
const menu = new UssdMenu({provider: 'hubtel'});
var bodyParser = require('body-parser');
const sql = require('mssql');
const http = require('http');
const { ifError } = require('assert');
let server = http.createServer(app);
let sessions = {};

//Configure middleware
app.use(bodyParser.json({}));

//Configure sessions
menu.sessionConfig({
    start: (sessionId, callback) => {
        if (!(sessionId in sessions)) sessions[sessionId] = {};
        callback();
    },
    end: (sessionId, callback) => {
        delete sessions[sessionId];
        callback();
    },
    set: (sessionId, key, value, callback) => {
        sessions[sessionId][key] = value;
        callback();
    },
    get: (sessionId, key, callback) => {
        let value = sessions[sessionId][key];
        callback(null, value);
    }
});


// sql config
const sqlConfig = {
    server: '',
    database: '',
    user:'',
    port: ,
    password:'',
    connectionTimeout:1500000,
    pool : {
        max: 10,
        min: 0,
        idleTimeoutMillis : 5000
    },
    options: {
        encrypt: true, // for azure
        trustServerCertificate: true // change to true for local dev / self-signed certs
      }
}

//catch sql errors
sql.on('error', err => {
    console.log(err.message);
})


//Define menus
menu.startState({
    next: {
        '' :async () => {
            console.log('Starting');
            try{
                console.log('connecting to db...');
                let pool = await sql.connect(sqlConfig);
                //console.log(pool);
                console.log('checking if user exists...');
                let result = await pool.request().query(`SELECT * FROM contact WHERE PhoneNumber = '${menu.args.phoneNumber}'`);
                let tel = result.recordset[0];
                sql.close();
                console.log(tel);
                console.log('data extracted successfully');
                if(tel === null || tel === undefined) {
                   return 'welcomeMenuForUnregisteredUsers';
                }
                else{
                    return 'selectPaymentOptionForRegisteredUsers'
                }
        }
        catch(err){
            console.log(err);
            sql.close();
            menu.end("A problem occurred")
        }
        /*menu.con('Welcome to Ghana Savings Challenge 30 day challenge \n' +
        '1. Sign Up');*/
    }
}
    /*next: {

        '1': 'signUp',
    }*/
});

menu.state('welcomeMenuForUnregisteredUsers', {
    run: () => {

        menu.con('Welcome to Ghana Savings Challenge - 30 day challenge \n' +
        '1. Sign Up');
    },
    next: {
        '1': 'signUp'
    }
});

menu.state('welcomeMenuForRegisteredUsers', {
    run: () => {
        menu.con('Welcome to Ghana Savings Challenge \n' +
        '1. Start new challenge \n' +
        '2. Check balance \n' +
        '3. Start new challenge \n' +
        '4. Check days left \n' +
        '5. Cash out \n' +
        '6. Invest \n' +
        '7. Enquiry \n')
    },

    next: {
        '1': 'selectPaymentOptionForRegisteredUsers',
        '2':'checkBalance'
        }
});

menu.state('signUp', {
    run: () => {

        menu.con('Select Savings Pattern \n' +
        '1. Ascending start with minimum of GHS 1 \n' +
        '2. Descending Order starting with minimum of GHS 30');
    },
    next: {
        '1': 'signUp.Ascending',
        '2': 'signUp.Descending'
    }
});


menu.state('signUp.Ascending', {
    run: () => {
        menu.con('Enter daily savings start amount: ')
    },
    next: {
        '*[0-9]+': function(){
            console.log('parsing string')
            let input = parseInt(menu.val);
            menu.session.set('amount', input);
            console.log('checking amount');
            if( input >= 1  && input <= 30) {
                console.log('going to payment options')
                return 'selectPaymentOptionForUnregisteredUsers'
            }
            else{
                console.log('returning menu')
                return 'signUp.Ascending'
            }
        }
    }
});

menu.state('signUp.Descending', {
    run: () => {
        menu.con('Enter daily savings start amount: ')
    },

    next: {
        '*[0-9]+': function(){
            let input = parseInt(menu.val);
            if( input >= 30) {
                return 'selectPaymentOptionForUnregisteredUsers'
            }
            else{
                return 'signUp.Descending'
            }
        }
    }
});

menu.state('selectPaymentOptionForUnregisteredUsers', {
    run: () => {
        menu.con(`Select payment option for your amount ${menu.session.get('amount')} \n` +
        '1. One-Time \n' +
        '2. Recurring')
    },
    next: {
        '1': 'oneTime',
        '2': 'recurring'
    }
});

menu.state('selectPaymentOptionForRegisteredUsers', {
    run: () => {
        menu.con(`Select payment option \n` +
        '1. One-Time \n' +
        '2. Recurring')
    },
    next: {
        '1': 'authorizePayment',
        '2': 'authorizePayment'
    }
})

menu.state('authorizePayment', {
    run: async () => {
        try{
            let pool = await sql.connect(sqlConfig);
            let results = await pool.query(`SELECT amount FROM contact WHERE phoneNumber = '${menu.args.phoneNumber}'`);
            let arrRes = Object.keys(results.recordset[0]);
            console.log('results', arrRes[3]);
            menu.session.set('amount', arrRes[3]);
            console.log(results);
            menu.con(`Authorize payment of ${arrRes[3]} to the GH Challenge. Enter MoMo Pin`)
        }
        catch(err){
            console.log('error', err);
        }
    },
    next: {
        '*[0-9]+': () => {
            //let input = menu.val.length;
            if(menu.val.length > 4 || menu.val.length < 1){
                return menu.end('Pin is invalid');
            }
            else{
                return 'paymentPrompt';
            }
        }
    }
})

menu.state('paymentPrompt', {
    run : () => {
        menu.session.get('amount').then((amount) => {
            let finalAmount = amount;
            menu.end(`Payment made GHc ${finalAmount} the GH Savings Challenge`)
        })
    }
})

menu.state('oneTime', {
    run: async () => {
        try{
            let pool = await  sql.connect(sqlConfig);
            //console.log(pool);
            console.log('registering user in db...');
            menu.session.get('amount').then((amount) => {
                let finalAmount = amount;
                var query = `INSERT INTO contact (PhoneNumber, PaymentOption, Amount, SessionId) VALUES ('${menu.args.phoneNumber}', 'recurring', '${finalAmount}', '${menu.args.sessionId}')`;
                console.log("query", query)
                let result = pool.request().query(query);
                console.log(result);
                //sql.close();
                console.log('successfully registered');
                })
            menu.go('thankYou')
        }
        catch(err){
            console.log(err);
            sql.close();
            menu.end('An error occurred')
        }
    }
})

menu.state('recurring', {
    run: async () => {
        console.log("recurring")
        try{
            let pool = await sql.connect(sqlConfig);
            console.log(pool);
            console.log('registering user in db...');
            menu.session.get('amount').then((amount) => {
            let finalAmount = amount;
            var query = `INSERT INTO contact (PhoneNumber, PaymentOption, Amount, SessionId) VALUES ('${menu.args.phoneNumber}', 'recurring', ${finalAmount}, '${menu.args.sessionId}')`;
            console.log("query", query)
            let result = pool.request().query(query);
            console.log(result);
            //sql.close();
            console.log('successfully registered');
            })
            menu.go('thankYou');
        }
        catch(err){
            console.log("error", err);
            sql.close();
            menu.end('An error occurred')
        }
    }
})

menu.state('thankYou', {
    run: () => {
        menu.end('Thank you for signing up for the GH Savings Challenge. \n' +
                  'Your details have been received. Your balance is 0');
    }
});


//endpoints
app.post('/ussd', (req, res)=>{
    // console.log(JSON.stringify( req.body))
    menu.run(req.body, ussdResult => {
       return res.send(ussdResult);
    });
});

server.listen(3001, () => {
    console.log(`Listening to requests on http://localhost:3001`);
  });

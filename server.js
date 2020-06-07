// server.js
// where your node app starts

// include modules
const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');
const sql = require("sqlite3").verbose();
const FormData = require("form-data");

// This creates an interface to the file if it already exists, and makes the
// file if it does not.
const shopDB = new sql.Database("postcards.db");

// Actual table creation; only runs if "postcards.db" is not found or empty
// Does the database table exist?
let cmd = " SELECT name FROM sqlite_master WHERE type='table' AND name='PostCardTable' ";
shopDB.get(cmd, function (err, val) {
    console.log(err, val);
    if (val == undefined) {
        console.log("No database file - creating one");
        createGrandmasDB();
    } else {
        console.log("Database file found");
    }
});

function createGrandmasDB() {
  // explicitly declaring the rowIdNum protects rowids from changing if the
  // table is compacted; not an issue here, but good practice
  const cmd = 'CREATE TABLE PostCardTable ( rowIdNum INTEGER PRIMARY KEY, url TEXT, img TEXT, txt TEXT, font TEXT, color TEXT)';
  shopDB.run(cmd, function(err, val) {
    if (err) {
      console.log("Database creation failure",err.message);
    } else {
      console.log("Created database");
    }
  });
}


// begin constructing the server pipeline
const app = express();

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, __dirname+'/images')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
// let upload = multer({dest: __dirname+"/assets"});
let upload = multer({storage: storage});


// Serve static files out of public directory
app.use(express.static('public'));

// Also serve static files out of /images
app.use("/images",express.static('images'));

// A middleware function to handles the GET query /shoppingList
// Observe that it either ends up sending the HTTP response or calls next(), so it
// is a valid middleware function.
function handleShoppingList(request, response, next) {
  let cmd = "SELECT * FROM PostCardTable"
  shopDB.all(cmd, function (err, rows) {
    if (err) {
      console.log("Database reading error", err.message)
      next();
    } else {
      // send shopping list to browser in HTTP response body as JSON
      response.json(rows);
      console.log("rows",rows);
    }
  });
}

// Handle GET request to base URL with no other route specified
// by sending creator.html, the main page of the app
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/public/creator.html');
});

// Handle a post request containing JSON
app.use(bodyParser.json());

app.get("/myLink", (req, res) => {
  console.log("answering query");
  let randomURLString = req.query.id;
  cmd = 'SELECT * FROM PostCardTable WHERE url = ?';
  shopDB.get(cmd, randomURLString, function(err, rows) {
    if (err) {
      console.log("Database reading error", err.message)
    } else {
      // send postcard to browser in HTTP response body as JSON
      res.json(rows);
      console.log("rows is: ", rows);
    }
  })
});


// A middleware function to handles the GET query /shoppingList
// Observe that it either ends up sending the HTTP response or calls next(), so it
// is a valid middleware function.
// FROM GRANDMA-DB:
// function handleShoppingList(request, response, next) {
//   let cmd = "SELECT * FROM ShopTable"
//   shopDB.all(cmd, function (err, rows) {
//     if (err) {
//       console.log("Database reading error", err.message)
//       next();
//     } else {
//       // send shopping list to browser in HTTP response body as JSON
//       response.json(rows);
//       console.log("rows",rows);
//     }
//   });

// Next, the the two POST AJAX queries

// Handle a post request to upload an image.
app.post('/upload', upload.single('newImage'), function (request, response) {
  console.log("Recieved",request.file.originalname,request.file.size,"bytes")
  if(request.file) {
    // file is automatically stored in /images,
    // even though we can't see it.
    // We set this up when configuring multer
    sendMediaStore("/images/"+request.file.originalname,request,response);
    response.end("recieved "+request.file.originalname);

    //deletes image after stored in api server
    fs.unlink("images/"+request.file.originalname, (err) => {
  if (err) {
    console.error(err)
    return
  }
  })
  }
  else throw 'error';
});

// gets JSON data into req.body
app.post('/saveDisplay', function (req, res ,next) {
  console.log(req.body);
  let url = randomString();
  let img = req.body.image;
  let txt = req.body.message;
  let font = req.body.font;
  let color = req.body.color;

  cmd = "INSERT INTO PostCardTable (url,img ,txt,font, color) VALUES (?,?,?,?,?) ";
  shopDB.run(cmd,url,img,txt,font,color, function(err) {
    if (err) {
      console.log("DB insert error",err.message);
      next();
    } else {
      console.log("url: ", url);
      res.send(url);
    }
  }) // callback, shopDB.run
});

function randomString() {
  var i = '';
  while(i.length < 6) {
    i = Math.random().toString(36).substring(7);
  };
  return i; }
// The GET AJAX query is handled by the static server, since the
// file postcardData.json is stored in /public

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});


// function called when the button is pushed
// handles the upload to the media storage API
function sendMediaStore(filename, serverRequest, serverResponse) {
  let apiKey = "4adpigxa60";
  if (apiKey === undefined) {
    serverResponse.status(400);
    serverResponse.send("No API key provided");
  } else {
    // we'll send the image from the server in a FormData object
    let form = new FormData();

    // we can stick other stuff in there too, like the apiKey
    form.append("apiKey", apiKey);
    // stick the image into the formdata object
    form.append("storeImage", fs.createReadStream(__dirname + filename));
    // and send it off to this URL
    form.submit("http://ecs162.org:3000/fileUploadToAPI", function(err, APIres) {
      // did we get a response from the API server at all?
      if (APIres) {
        // OK we did
        console.log("API response status", APIres.statusCode);
        // the body arrives in chunks - how gruesome!
        // this is the kind stream handling that the body-parser
        // module handles for us in Express.
        let body = "";
        APIres.on("data", chunk => {
          body += chunk;
        });
        APIres.on("end", () => {
          // now we have the whole body
          if (APIres.statusCode != 200) {
            serverResponse.status(400); // bad request
            serverResponse.send(" Media server says: " + body);
          } else {
            serverResponse.status(200);
            // serverResponse.send(body);
          }
        });
      } else { // didn't get APIres at all
        serverResponse.status(500); // internal server error
        serverResponse.send("Media server seems to be down.");
      }
    });
  }
}

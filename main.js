// Modules to control application life and create native browser window
const {app, BrowserWindow, dialog, Menu} = require('electron');
const ipcMain = require('electron').ipcMain;
const ipcRenderer = require('electron').ipcRenderer;
const path = require('path');
const url = require('url');
const fs = require('fs');
const log = require('electron-log');
const {autoUpdater} = require('electron-updater');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'silly';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let configWindow;
let configSettings;
let printDoc;
let timer;
let waiting = true;
let printing = false; //set current printing status

let numDocsToPrint = 0;
let numDocsInBatch = 0;
let numDocsInBatchCountdown = 0;
let numDocsPrintedOffset = 0;
let docIndex = 0;
let almaHost;
let localPrinterList ;
let almaPrinters;
let menuOffset = 0;
let configFile =  app.getPath("userData") + "/alma-print-config.json";

console.log ('Config file = ' + configFile);

//Set up macOS-specific stuff
const isMac = process.platform === 'darwin';
console.log ('isMac = ' + isMac);
if (isMac) {
  menuOffset = 1;
}
 
function createWindow () {

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    // show: false,
	title: "Alma Print Daemon",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true
    }
  })

  //mainWindow.webContents.openDevTools();
  localPrinterList = mainWindow.webContents.getPrinters();
  
  InitializeApp (true);

  if (configSettings.apiKey.length == 0) {
    createConfigWindow();
  }

  mainWindow.webContents.on('did-finish-load', () => {

    console.log('In did-finish-load-document');
    if (waiting) {
      console.log ('Now waiting for next batch, either automatic or manual...');
      return;
    }
    mainWindow.webContents.print({silent: true, deviceName: configSettings.localPrinter}, function(success){
        if (success) {
           console.log('print success mainWindow');
           let postRequest = printDoc.printout[docIndex].link + '?op=mark_as_printed&apikey=' + configSettings.apiKey;

           updateDocument(postRequest);

           docIndex++;
           if (docIndex < numDocsInBatch) {
              console.log('load document #' + docIndex);
              mainWindow.loadURL('data:text/html;charset=utf-8,'  + encodeURIComponent(printDoc.printout[docIndex].letter));
              AdjustIterators();
           }
           else if (numDocsToPrint) {
              console.log('More docs to retrieve.  Make request with offset = ' + numDocsPrintedOffset);
              getDocuments(numDocsPrintedOffset);
           } else {
              console.log('all docs in batch done');
              numDocsPrintedOffset = 0;
              setPrintingStatusPage();
           }
          }
      })
  })


  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    app.quit();
    mainWindow = null;
  })
}

function AdjustIterators() {
  numDocsToPrint--;
  numDocsInBatchCountdown--;
  numDocsPrintedOffset++;
}

function InitializeApp(initialize) {
  if (!loadConfiguration()) {
    console.log ("loadConfiguration failed");
    //const options = {
    //  type: 'error',
    //  buttons: ['Close'],
    //  title: 'Configuration Error',
    //  message: 'The Alma Print Daemon configuration file does not exist; defaults applied.'
    //  }
    //dialog.showMessageBox(mainWindow, options, (response) => {
    //  console.log('The response is ' + response)
    //})
  }

  almaHost = "https://api-" + configSettings.region + ".hosted.exlibrisgroup.com";

  console.log ("almaHost = " + almaHost);

  if (initialize) {
      setMenus();
  }
  else {
      resetMenus();
  }

  if (configSettings.apiKey.length != 0) {
    getAlmaPrinters();
  }

  if (configSettings.interval == 0) {
    loadPage('docsPrintManualPaused.html');
    setManualPrintingConfigMenuStatus (true);
  }
  else {
    loadPage('docsPrintIntervalPaused.html');
  }
}

function createConfigWindow() {
  configWindow = new BrowserWindow({
    width: 500,
    height: 525,
    title: "Configuration",
    modal: true,
    resizeable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: true
    }
  })
  configWindow.setMenuBarVisibility(false);
  configWindow.loadURL('File://' + __dirname + '\\configWindow.html');

  //configWindow.webContents.openDevTools();

  configWindow.webContents.on('did-finish-load', () => {
    console.log ('did-finish-load for configWindow');
    console.log ('Send saved settings to configWindow');
    configWindow.webContents.send('send-settings', configSettings);
    console.log ('Send local printers to configWindow');
    configWindow.webContents.send('local-printers', localPrinterList);
    console.log ('Send alma printers to configWindow');
    configWindow.webContents.send('alma-printers', almaPrinters);
  })
  //configWindow.removeMenu();
  configWindow.on('close', function(){
    configWindow = null
  })
}

//Catch 'save-settings' from renderer
ipcMain.on('save-settings', function(e, configString){
  console.log ('from renderer: user saved settings = ' + configString);
  // Write JSON Alma config file
  fs.writeFileSync(configFile, configString);
  configWindow.close();
  // quit and relaunch app to make new settings effective
  //app.relaunch();
  //app.quit();
  InitializeApp(false);
})

//Catch "Print now" from renderer
ipcMain.on('print-now', function (e){
  console.log('from renderer:  user clicked print now');
  getDocuments(0);
})

//Catch "Pause printing" from renderer
ipcMain.on('print-pause', function (e){
  console.log('from renderer:  user clicked pause printing');
  setPrintingStatus();
})

//Catch "Continue printing" from renderer
ipcMain.on('print-continue', function(e) {
  console.log('from renderer:  user clicked continue printing');
  setPrintingStatus();
})

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

autoUpdater.on('update-available', () => {
  mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update_downloaded');
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
  createWindow();
  autoUpdater.allowPrerelease = true;
  autoUpdater.checkForUpdatesAndNotify();
})

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit();
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
})


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const mainMenuTemplate = [
  {
    label:'File',
    visible: true,
    submenu:[
      {
        label: 'Configuration...',
        accelerator: 'CommandOrControl+O',
        click(){
        createConfigWindow();
       }
      },
      {
        label: 'Print now',
        accelerator:  'CommandOrControl+P',
        id: 'manual-print',
        visible: false,
        click(){
          getDocuments(0);
        }
      },
      {
        label: 'Continue printing',
        accelerator: 'CommandOrControl+P',
        id: 'interval-print',
        visible: false,
        click(){
          setPrintingStatus();
        }
      },
      {
        label: 'Exit',
        accelerator: process.platform == 'darwin' ? 'Command+Q' : 'Alt+F4',
        click(){
          app.quit();
        }
      }
    ]
  }
]

function loadConfiguration(){
  console.log('Loading configuration...');
  let rc = false;
  let configData;
  //Check if config file exists.
  if (!fs.existsSync(configFile)) {
    console.log ('config file not found...use defaults');
    configData = "{\"region\": \"ap\",\"apiKey\": \"\",\"almaPrinter\": \"\",\"localPrinter\": \"\",\"interval\": \"5\"}";
  }
  else {
    console.log ('config file exists...read settings');
    configData = fs.readFileSync(configFile);
    rc = true;
  }

  const configJSON = configData.toString('utf8');
  configSettings = JSON.parse(configJSON);
  configSettings.localPrinter = decodeURIComponent(configSettings.localPrinter);

  console.log('Region = ' + configSettings.region);
  console.log('API Key = ' + configSettings.apiKey);
  console.log('Alma Printer = ' + configSettings.almaPrinter);
  console.log('Local Printer = ' + configSettings.localPrinter);
  console.log('Interval (minutes) = ' + configSettings.interval);

  return rc;
}

function setMenus(){
  console.log ('in setMenus');
  
  if (isMac) {
    mainMenuTemplate.unshift ({
      label: app.getName(),
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {role: 'services', submenu: []},
        {type: 'separator'},
        {role: 'hide'},
        {role: 'hideothers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'}
      ]
    })
  }

  if (configSettings.interval == 0) {
    mainMenuTemplate[menuOffset].submenu[1].visible = true;
    mainMenuTemplate[menuOffset].submenu[2].visible = false;
  }
  else {
    mainMenuTemplate[menuOffset].submenu[1].visible = false;
    mainMenuTemplate[menuOffset].submenu[2].visible = true;
  }
  
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function resetMenus(){
  console.log ('in resetMenus');

  if (configSettings.interval == 0) {
    mainMenuTemplate[menuOffset].submenu[1].visible = true;
    mainMenuTemplate[menuOffset].submenu[2].visible = false;
  }
  else {
    mainMenuTemplate[menuOffset].submenu[1].visible = false;
    mainMenuTemplate[menuOffset].submenu[2].visible = true;
  }
  
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function setPrintingStatus(){
  console.log ('in setPrintingStatus');
  //Currently printing, so now set to paused since user clicked pause printing.
  if (printing) {
    console.log ('Paused printing...timer cleared.');
    printing = false;
    mainMenuTemplate[menuOffset].submenu[2].label = 'Continue printing';
    mainMenuTemplate[menuOffset].submenu[2].enabled = true;
    //clear the timer since user has paused printing
    clearTimeout (timer);
    loadPage('docsPrintIntervalPaused.html');
    //Enable "File|Configuration..." menu option....things can be changed while printing is paused.
    mainMenuTemplate[menuOffset].submenu[0].enabled = true;
  }
  //Currently paused, so now set to printing since user clicked continue printing.
  else {
    console.log ('Continued printing...')
    printing = true
    mainMenuTemplate[menuOffset].submenu[2].label = 'Pause printing';
    //Disable "File|Configuration..." menu option....things can't be changed while printing.
    mainMenuTemplate[menuOffset].submenu[0].enabled = false;
    getDocuments(0);
  }

  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function setManualPrintingConfigMenuStatus(value) {
  //Enable "File|Configuration..." menu option....things can be changed while printing is paused.
  mainMenuTemplate[menuOffset].submenu[0].enabled = value;
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

//Function to control if documents should be requested when the timer hits
function getDocumentsTimerController() {
  console.log ('Timer triggered');
  getDocuments(0);
}

//Function that communicates with Alma to get the documents to print.
function getDocuments(offset){

  console.log ('in getDocuments()');

  const https = require('https');
  let data = '';

  let request = almaHost + '/almaws/v1/task-lists/printouts?&status=Pending&apikey=' + configSettings.apiKey + '&limit=100&offset=' + offset + '&format=json';
  if (configSettings.almaPrinter.length > 0) {
    request = request + '&printer_id=' + configSettings.almaPrinter;
  }
  console.log ("request = " + request);
  docIndex = 0;
  waiting = false;

  SetMenuAction(false);

  https.get(
    request, (resp) =>{
      // A chunk of data has been received.
      resp.on('data', (chunk) =>{
        data += chunk;
      });
      // Response has ended.
      resp.on('end', () =>{
        console.log("get request response done!");
        //console.log("response = " + data);
        if (data.substring(0, 5) == "<?xml") {
          console.log("xml response = " + data);
          let errorsExist = data.indexOf("<errorsExist>true</errorsExist>");
          if (errorsExist != -1) {
            console.log ("Error in request");
            let startErrorMessage = data.indexOf("<errorMessage>") + 14;
            let endErrorMessage = data.indexOf("</errorMessage>");
            let errorMessage = data.substring(startErrorMessage, endErrorMessage);
            console.log ("Error message = " + errorMessage);
            const options = {
              type: 'error',
              buttons: ['Close'],
              title: 'Communication Error',
              message: errorMessage
            }
            dialog.showMessageBox(mainWindow, options, (response) => {
              console.log('The response is ' + response)
            })
            waiting = true;
            setPrintingStatus();
            return;
          }
        }
        if (data.length == 0) {
          console.log ("No data received...")
          if (configSettings.interval > 0) {
            loadPage('docsPrintedInterval.html');
            setDocRequestTimer();
            SetMenuAction(true);
          }
          else {
            loadPage('docsPrintedManual.html');
            setManualPrintingConfigMenuStatus (true);
            waiting = true
          }
          return
        }
        //clear the timer since we are currently processing documents
        console.log ('processing documents....clear timer');
        clearTimeout (timer);
        printDoc = JSON.parse(data);
        if (printDoc.total_record_count == 0) {
          console.log ("No documents in response...set printing status page appropriately");
          setPrintingStatusPage();
          return;
        }
        console.log ("Parsed JSON response...now start printing");
        if (printDoc.printout.length > 0) {
          //If an offset was passed in, we are in the middle of processing a batch of documents...don't reset the number of docs to print
          if (offset == 0) {
            numDocsToPrint = printDoc.total_record_count;
          }
          numDocsInBatch = printDoc.printout.length;
          numDocsInBatchCountdown = numDocsInBatch;
          console.log('number of documents total = ' + numDocsToPrint); 
          console.log('number of documents in request response = ' + numDocsInBatch);
          console.log('load document #' + docIndex);
          mainWindow.loadURL('data:text/html;charset=utf-8,'  + encodeURIComponent(printDoc.printout[docIndex].letter));
          AdjustIterators();
        }
        else {
          console.log ("No documents in response...set printing status page appropriately");
          setPrintingStatusPage();
        }
      })

    }).on('error', (e) => {
      const options = {
        type: 'error',
        buttons: ['Close'],
        title: 'Communication Error',
        message: 'An error occurred communicating with Alma. Please check your Alma Print Daemon configuration settings and try again.',
        detail: JSON.stringify(e)
      }
      dialog.showMessageBox(mainWindow, options, (response) => {
        console.log('The response is ' + response);
      })
      waiting = true;
      //SetMenuAction(true);
      setPrintingStatus();
    })
}

//Function that calls API to update a document as having been printed.
function updateDocument(postRequest){

  console.log ('in updateDocument()');
  console.log('issue post to mark document as printed:  ' + postRequest);

  const request = require('request');

  request.post({url: postRequest, form: {key:'value'}}, function (error, response, body){
    if (error) {
      console.error('error:', error); // Print the error if one occurred
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      //console.log('body:', body); // Print the HTML 
      const options = {
        Type: 'error',
        buttons: ['Close'],
        title: 'Update Failed',
        message: 'An error occurred updating the document as printed: ' + postRequest,
        details: JSON.stringify(error)
      }
      dialog.showMessageBox(mainWindow, options, (response) => {
        console.log('The response is ' + response);
      })
    } 
  } )
}

function setDocRequestTimer() {
  //If interval is not set, user is manually requesting documents to be printed.....don't set timer
  if (configSettings.interval == 0) {
    return;
  }
  console.log ('set timer to get next batch of documents to print');
  timer = setTimeout(getDocumentsTimerController, configSettings.interval  * 60000);
}

function loadPage(page) {
  mainWindow.loadURL('File://' + __dirname + '\\' + page);
  //The code below for loading the URL does not work on MacOS.
  //mainWindow.loadURL(url.format({
  //  pathname: path.join(__dirname, page),
  //  protocal: 'file:',
  //  slashes: true
  //}))
}

function SetMenuAction(value) {
  console.log ("in SetMenuAction");
  if (configSettings.interval == 0) {
    console.log (mainMenuTemplate[menuOffset].submenu[1].label + " = " + value);
    mainMenuTemplate[menuOffset].submenu[1].enabled = value;
  }
  else {
    console.log (mainMenuTemplate[menuOffset].submenu[2].label + " = " + value);
    mainMenuTemplate[menuOffset].submenu[2].enabled = value;
  }

  //If we are waiting, configuration settings can be changed.....but if not waiting, they cannot.
  if (waiting) {
    mainMenuTemplate[menuOffset].submenu[0].enabled = true;
  }
  else {
    mainMenuTemplate[menuOffset].submenu[0].enabled = false;
  } 
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function setPrintingStatusPage(){
  console.log ('In setPrintingStatusPage');
  if (configSettings.interval > 0) {
    loadPage ('docsPrintedInterval.html');
    setDocRequestTimer();
    SetMenuAction(true);
    waiting = true;
  }
  else {
    loadPage('docsPrintedManual.html');
    waiting = true;
    SetMenuAction(true);
  }
}

//Function that communicates with Alma to get the Alma printers.
function getAlmaPrinters(){
  console.log ('in getAlmaPrinters()');

  const https = require('https');
  let data = '';

  let request = almaHost + "/almaws/v1/conf/printers?apikey=" + configSettings.apiKey  + '&printout_queue=true&limit=100&format=json';
  console.log ("request = " + request);

  https.get(
    request, (resp) =>{
      // A chunk of data has been received.
      resp.on('data', (chunk) =>{
        data += chunk;
      });
      // Response has ended.
      resp.on('end', () =>{
        console.log("get request response done!");
        console.log("response = " + data);
        if (data.substring(0, 5) == "<?xml") {
          console.log("xml response = " + data);
          let errorsExist = data.indexOf("<errorsExist>true</errorsExist>");
          if (errorsExist != -1) {
            console.log ("Error in request");
            let startErrorMessage = data.indexOf("<errorMessage>") + 14;
            let endErrorMessage = data.indexOf("</errorMessage>");
            let errorMessage = data.substring(startErrorMessage, endErrorMessage);
            console.log ("Error message = " + errorMessage);
            const options = {
              type: 'error',
              buttons: ['Close'],
              title: 'Communication Error',
              message: errorMessage
            }
            dialog.showMessageBox(mainWindow, options, (response) => {
              console.log('The response is ' + response);
            })
            return;
          }
        }
        if (data.length == 0) {
          console.log ("No alma printers data received...");
          return;
        }
        almaPrinters = JSON.parse(data);
        if (almaPrinters != null) {
          if (almaPrinters.total_record_count == 0) {
            const options = {
              type: 'error',
              buttons: ['Close'],
              title: 'Configuration Error',
              message: 'There are no Alma printout queues for the supplied API key. Please check your configuration.'
            }
            dialog.showMessageBox(mainWindow, options, (response) => {
              console.log('The response is ' + response);
            })
          }
        }
      })
    }).on('error', (e) => {
      const options = {
        type: 'error',
        buttons: ['Close'],
        title: 'Communication Error',
        message: 'An error occurred requesting available Alma printout queues. Please check your Alma Print Daemon configuration settings and try again.',
        detail: JSON.stringify(e)
      }
      dialog.showMessageBox(mainWindow, options, (response) => {
        console.log('The response is ' + response);
      })
    })
}

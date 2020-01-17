// Modules to control application life and create native browser window
const {app, BrowserWindow, dialog, Menu} = require('electron')
const ipcMain = require('electron').ipcMain
const ipcRenderer = require('electron').ipcRenderer
const path = require('path')
const url = require('url')
const fs = require('fs');

require('update-electron-app')()

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let configWindow
let configSettings
let printDoc
let timer
let waiting = true
let printing = false //set current printing status

let docsInBatch = 0
let docCount = 0
let localPrinterList 
let almaPrinterList
let configFile =  app.getPath("userData") + "/alma-print-config.json";
console.log ('Config file = ' + configFile);

const isMac = process.platform === 'darwin';
console.log ('isMac = ' + isMac);

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
  
  localPrinterList = mainWindow.webContents.getPrinters();
  
  InitializeApp (true);

  if (configSettings.almaHost.length == 0 || configSettings.apiKey.length == 0) {
    createConfigWindow();
  }

  mainWindow.webContents.on('did-finish-load', () => {

    console.log('In did-finish-load-document')
    if (waiting) {
      console.log ('Now waiting for next batch, either automatic or manual...');
      return;
    }
    mainWindow.webContents.print({silent: true, deviceName: configSettings.localPrinter}, function(success){
        if (success) {
          
           console.log('print success mainWindow');
           let postRequest = printDoc.printout[docCount].link + '?op=mark_as_printed&apikey=' + configSettings.apiKey;

           updateDocument(postRequest);

           docCount++;
           if (docCount < printDoc.total_record_count) {
              console.log('load document #' + docCount);
              mainWindow.loadURL('data:text/html;charset=utf-8,'  + encodeURIComponent(printDoc.printout[docCount].letter));
           }
           else {
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

  if (initialize) {
      setMenus();
  }
  else {
      resetMenus();
  }
  
  if (configSettings.interval == 0){
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
    height: 475,
    title: "Configuration",
    modal: true,
    resizeable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: true
    }
  })
  configWindow.setMenuBarVisibility(false)

  configWindow.loadURL('File://' + __dirname + '\\configWindow.html')
  //configWindow.webContents.openDevTools();
  configWindow.webContents.on('did-finish-load', () => {
    console.log ('did-finish-load for configWindow');
    console.log ('Send saved settings to configWindow');
    configWindow.webContents.send('send-settings', configSettings);
    console.log ('Send local printers to configWindow');
    configWindow.webContents.send('local-printers', localPrinterList);
    console.log ('Send alma printers to configWindow');
    configWindow.webContents.send('alma-printers', almaPrinterList);
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

ipcMain.on('get-settings', function(e){
  console.log('from renderer: get-settings');
  e.sender.send('ping', 'test');
})

//Catch "Print now" from renderer
ipcMain.on('print-now', function (e){
  console.log('from renderer:  user clicked print now');
  getDocuments();
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

//Catch "give me local printers" from renderer
ipcMain.on('get-local-printers', function(e){
  console.log('from renderer: give me local printers');
  mainWindows.webcontents.send('local-printers', printerList)
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const mainMenuTemplate = [
  {
    label:'File',
    visible: false,
    submenu:[
      {
        label: 'Configuration...',
        click(){
        createConfigWindow();
       }
      },
      {
        label: 'Print now',
        id: 'manual-print',
        visible: false,
        click(){
          getDocuments();
        }
      },
      {
        label: 'Continue printing',
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

  //Check if config file exists.
  if (!fs.existsSync(configFile)) {
    console.log ('config file not found...use defaults');
    const configData = "{\"almaHost\": \"https:\/\/api-XX.hosted.exlibrisgroup.com\",\"apiKey\": \"\",\"almaPrinter\": \"\",\"localPrinter\": \"\",\"interval\": \"5\"}"
    const configJSON = configData.toString('utf8');

    configSettings = JSON.parse(configJSON)
  }
  else {
    console.log ('config file exists...read settings');
    const configData = fs.readFileSync(configFile);
    const configJSON = configData.toString('utf8');

    configSettings = JSON.parse(configJSON)

    //Ensure host starts with https://
    if (configSettings.almaHost.substring(0, 8) != 'https://') {
      console.log ("almaHost is not https protocol...fix it! = " + configSettings.almaHost.substring(0 ,8));
      if (configSettings.almaHost.substring(0, 7) == 'http://') {
        console.log ("switching almaHost from http to https");
        configSettings.almaHost = "https://" + configSettings.almaHost.substring(7);
      }
      else {
        console.log ("adding https to almaHost")
        configSettings.almaHost = "https://" + configSettings.almaHost;
      }
    }
    rc = true;
  }

  console.log('Alma Host = ' + configSettings.almaHost);
  console.log('API Key = ' + configSettings.apiKey);
  console.log('Alma Printer = ' + configSettings.almaPrinter);
  console.log('Local Printer = ' + configSettings.localPrinter);
  console.log('Interval (minutes) = ' + configSettings.interval);

  return rc;
  
}

function setMenus(){
  console.log ('in setMenus')

  if (configSettings.interval == 0) {
    mainMenuTemplate[0].submenu[1].visible = true;
    mainMenuTemplate[0].submenu[2].visible = false;
  }
  else {
    mainMenuTemplate[0].submenu[1].visible = false;
    mainMenuTemplate[0].submenu[2].visible = true;
  }
  
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
  
  //If you want the "Developer Tools" in the browser window...
  //mainMenuTemplate.push({
  //  label: 'Developer Tools',
  //  submenu:[
  //    {
  //      label: 'Toggle DevTools',
  //      accelerator: process.platform == 'darwin' ? 'Command+I' : 'Ctrl+I',
  //       click(item, focusedWindow){
  //        focusedWindow.toggleDevTools();
  //       }
  //    },
  //    {
  //      role: 'reload'
  //    }
  //  ]
  //})
  
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function resetMenus(){
  console.log ('in resetMenus')

  if (configSettings.interval == 0) {
    mainMenuTemplate[0].submenu[1].visible = true;
    mainMenuTemplate[0].submenu[2].visible = false;
  }
  else {
    mainMenuTemplate[0].submenu[1].visible = false;
    mainMenuTemplate[0].submenu[2].visible = true;
  }
  
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function setPrintingStatus(){
  console.log ('in setPrintingStatus')

  //Currently printing, so now set to paused since user clicked pause printing.
  if (printing) {
    console.log ('Paused printing...timer cleared.')
    printing = false
    mainMenuTemplate[0].submenu[2].label = 'Continue printing'
    mainMenuTemplate[0].submenu[2].enabled = true;
    //clear the timer since user has paused printing
    clearTimeout (timer);
    loadPage('docsPrintIntervalPaused.html')
    //Enable "File|Configuration..." menu option....things can be changed while printing is paused.
    mainMenuTemplate[0].submenu[0].enabled = true;
  }
  //Currently paused, so now set to printing since user clicked continue printing.
  else {
    console.log ('Continued printing...')
    printing = true
    mainMenuTemplate[0].submenu[2].label = 'Pause printing'
    //Disable "File|Configuration..." menu option....things can't be changed while printing.
    mainMenuTemplate[0].submenu[0].enabled = false;
    getDocuments()
  }

  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function setManualPrintingConfigMenuStatus(value) {
      //Enable "File|Configuration..." menu option....things can be changed while printing is paused.
      mainMenuTemplate[0].submenu[0].enabled = value;
      const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
      Menu.setApplicationMenu (mainMenu);
}

//Function that communicates with Alma to get the documents to print.
function getDocuments(){

  console.log ('in getDocuments()')

  if (docsInBatch != docCount) {
    console.log ('all docs in current batch not printed yet...do not ask for next batch')
    return
  }
  else {
    console.log('all docs from current batch printed...ask for next batch')
  }
  
  const https = require('https');
  let data = ''

  let request = configSettings.almaHost + '/almaws/v1/task-lists/printouts?&status=Pending&printer=' + configSettings.almaPrinter + '&apikey=' + configSettings.apiKey + '&format=json'
  docCount = 0
  waiting = false

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
          //data = data.replace(/\s/g, '');
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
            loadPage('docsPrintedInterval.html')
            setDocRequestTimer();
            SetMenuAction(true);
          }
          else {
            loadPage('docsPrintedManual.html')
            setManualPrintingConfigMenuStatus (true);
            waiting = true
          }
          return
        }
        printDoc = JSON.parse(data)
        console.log ("Parsed JSON response...now start printing");
        if (printDoc.total_record_count > 0) {
          docsInBatch = printDoc.total_record_count
          console.log('number of documents = ' + printDoc.total_record_count) 
          console.log('load document #' + docCount)
          mainWindow.loadURL('data:text/html;charset=utf-8,'  + encodeURIComponent(printDoc.printout[docCount].letter))
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
        message: 'An error occurred communicating with Alma. Please check your Alma configuration options and try again.',
        detail: JSON.stringify(e)
      }
      dialog.showMessageBox(mainWindow, options, (response) => {
        console.log('The response is ' + response)
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
        console.log('The response is ' + response)
      })
    } 
  } )

}

function setDocRequestTimer(){
  //If interval is not set, user is manually requesting documents to be printed.....don't set timer
  if (configSettings.interval == 0) {
    return
  }
  console.log ('set timer to get next batch of documents to print')
  timer = setTimeout(getDocuments, configSettings.interval  * 60000);
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
    console.log (mainMenuTemplate[0].submenu[1].label + " = " + value)
    mainMenuTemplate[0].submenu[1].enabled = value
  }
  else {
    console.log (mainMenuTemplate[0].submenu[2].label + " = " + value)
    mainMenuTemplate[0].submenu[2].enabled = value
  }

  //If we are waiting, configuration options can be changed.....but if not waiting, they cannot.
  if (waiting) {
    mainMenuTemplate[0].submenu[0].enabled = true;
  }
  else {
    mainMenuTemplate[0].submenu[0].enabled = false;
  } 
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu (mainMenu);
}

function setPrintingStatusPage(){
  console.log ('In setPrintingStatusPage');
  if (configSettings.interval > 0) {
    loadPage ('docsPrintedInterval.html')
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

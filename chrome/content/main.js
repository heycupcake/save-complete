/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Save Complete.
 *
 * The Initial Developer of the Original Code is
 * Stephen Augenstein <perl dot programmer at gmail dot com>.
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

function scTrans(key) {
    if(!scTrans.strings) {
        scTrans.strings = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://savecomplete/locale/save_complete.properties");
        scTrans.cache = {};
    }
    if(!scTrans.cache[key]) scTrans.cache[key] = scTrans.strings.GetStringFromName(key);
    return scTrans.cache[key];
}

var scMain = {
    debug: false,
    savers: [],
    /* Main functions */
    onload: function() { // Called when Firefox runs
        // Make sure not called again and the listener is cleaned up
        window.removeEventListener('load',scMain.onload, true);

        // Set up preference change observer
        scMain.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.savecomplete@perlprogrammer.com.");
        scMain.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
        scMain.prefs.addObserver("", scMain, false);

        // Hook context menu to contextShow
        var contextMenu = document.getElementById('contentAreaContextMenu');
        contextMenu.addEventListener('popupshowing', scMain.contextShow, true);

        // Set debug from prefs (updated when it changes, so we only need to initialize it)
        scMain.debug = scMain.prefs.getBoolPref('debug');

        scMain.updateUIFromPrefs();
    },
    updateUIFromPrefs: function() {
        scMain.dump('Updating UI from preferences');
        var replaceBuiltin = scMain.prefs.getBoolPref('replace_builtin');

        // Show in context menu if the preference for it is set and replace builtin is not on
        scMain.showInContext = !replaceBuiltin && scMain.prefs.getBoolPref('context');

        // Replace built-in save if preference is set
        var builtinSaveCommand = document.getElementById('Browser:SavePage');
        var contextSave = document.getElementById('context-savepage');
        var saveCompleteMenuItem = document.getElementById('scNormalSaveFileMenuItem');
        if(replaceBuiltin) {
            builtinSaveCommand.setAttribute('oncommand', 'scMain.overrideSave()');
            contextSave.setAttribute('oncommand', 'scMain.overrideSave()');
            saveCompleteMenuItem.hidden = true;
        } else {
            builtinSaveCommand.setAttribute('oncommand', 'saveDocument(window.content.document)');
            contextSave.setAttribute('oncommand', 'gContextMenu.savePageAs();');
            saveCompleteMenuItem.hidden = false;
        }
    },
    contextShow: function() {
        if(!scMain.showInContext) return;
        gContextMenu.showItem("scNormalSaveContextMenuItem", !( gContextMenu.inDirList || gContextMenu.isContentSelected || gContextMenu.onLink));
    },
    save: function() { // Called by selecting from either the context menu or the file menu
        // Get page that is supposed to be saved
        var focusedWindow = document.commandDispatcher.focusedWindow;
        if (focusedWindow == window) focusedWindow = _content;
        scMain.saveDocument(focusedWindow.document);
    },
    saveDocument: function(doc) { // Call directly if focusedWindow code doesn't work (like for Custom Buttons)
        // First check if it's html and if it's from an accepted protocol
        if(doc.contentType != "text/html" && doc.contentType != "application/xhtml+xml") {
            alert(scTrans('savecompleteIllegalContentType'));
            return;
        } else if(doc.location.href.match(/^(ftp|file|chrome|view-source|about|javascript|news|snews|ldap|ldaps|mailto|finger|telnet|gopher|irc|mailbox)/)) {
            alert(scTrans('savecompleteIllegalProtocol')+"\n"+doc.location.href.split("://").shift()+"://");
            return;
        }

        // Create a save dialog and then display it
        var nsIFilePicker = Components.interfaces.nsIFilePicker;
        var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
        fp.init(window, scTrans('savecompleteSavePage'), nsIFilePicker.modeSave);
        fp.appendFilter(scTrans('savecompleteSaveFilter'),"");

        // The default save string is either the url after the '/' or it is the title of the document
        // I've tried to be as close to the default behavior in Firefox as possible
        var defaultSaveString = "Saved Page.html";
        if(doc.location.pathname.split("/").pop() == "") // Nothing after '/' so use the title
            defaultSaveString = doc.title+".html";
        else {
            defaultSaveString = doc.location.pathname.split("/").pop();
            if(defaultSaveString.match(/\.x?html?$/) == null) defaultSaveString += ".html";
        }
        fp.defaultString = defaultSaveString.replace(/ *[:*?|<>\"/]+ */g," "); // Clean out illegal characters

        var res = fp.show();
        if (res == nsIFilePicker.returnCancel) return;

        scMain.internalSave(doc, fp.file);
    },
    overrideSave: function() { // Called by overridden internal Firefox save
        /* overrideSave overrides functions defined in contentAreaUtils.js to
         * maintain support for the original save functionality, while at the same
         * time enhancing complete webpage saves.
         */
        // Check if can override successfully
        if(typeof window['getTargetFile'] == 'undefined' || typeof window['saveDocument'] == 'undefined') {
            scMain.save();
            return;
        }

        // Get document
        var focusedWindow = document.commandDispatcher.focusedWindow;
        if (focusedWindow == window) focusedWindow = _content;
        var doc = focusedWindow.document;

        // First, replace getTargetFile with one of our own making
        var originalGetTargetFile = window['getTargetFile'];
        window['getTargetFile'] = function(fpParams, aSkipPrompt) {
            // Run original
            var returnValue = originalGetTargetFile(fpParams, aSkipPrompt);
            if(!returnValue) return false;

            if(fpParams.saveMode != 0 && fpParams.saveAsType == 0) {
                // Save webpage complete selected so override and return false to stop internalSave
                scMain.dump('Using savecomplete save instead of firefox save');
                scMain.internalSave(doc, fpParams.file);
                return false;
            }

            return returnValue;
        };

        // Call saveDocument
        saveDocument(doc, false);

        // Finally restore getTargetFile to what it was originally
        window['getTargetFile'] = originalGetTargetFile;
    },
    internalSave: function(doc, fileObject) {
        var saver = new scPageSaver(
            doc,
            new scPageSaver.scDefaultFileSaver(fileObject),
            new scPageSaver.scDefaultFileProvider(),
            {
                saveIframes: scMain.prefs.getBoolPref('save_iframes'),
                saveObjects: scMain.prefs.getBoolPref('save_objects'),
                rewriteLinks: scMain.prefs.getBoolPref('rewrite_links'),
                callback: scMain.saverComplete
            }
        );
        scMain.savers.push(saver);
        saver.run();
    },
    saverComplete: function(saver, result, messages) {
        for(var i = 0; i < scMain.savers.length; i++) {
            if(scMain.savers[i] === saver) {
                scMain.savers.splice(i, 1);
            }
        }

        scMain.dumpObj(messages);
    },
    observe: function(subject, topic, data) {
        // Observer for pref changes
        if (topic != "nsPref:changed") return;

        scMain.dump('Pref changed: '+data);
        switch(data) {
            case 'context':
            case 'replace_builtin':
                scMain.updateUIFromPrefs();
                break;
            case 'debug':
                scMain.debug = scMain.prefs.getBoolPref('debug');
                break;
        }
   },
    /* Console logging functions */
    dump: function(message) { // Debuging function -- prints to javascript console
        if(!scMain.debug) return;
        var ConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService(Components.interfaces.nsIConsoleService);
        ConsoleService.logStringMessage("[savecomplete] "+message);
    },
    dumpObj: function(obj, level) {
        if(!scMain.debug) return;
        if(level == undefined) level = 0;
        var returnStr = "";
        var indent = "";
        for(var l = 0; l < level; l++) {
            indent += "\t";
        }

        if(obj === null) {
            returnStr = 'null';
        } else if(obj === undefined) {
            returnStr = 'undefined';
        } else if(obj.constructor.name == 'String') {
            returnStr = '"'+obj+'"';
        } else if(typeof obj == 'number') {
            returnStr = obj.toString();
        } else if(typeof obj == 'boolean') {
            returnStr = (obj)?'true':'false';
        } else if(obj.constructor.name == 'Array') {
            var arrayStr = "";
            if(obj.length) {
                arrayStr += "[\n";
                for(var i = 0; i < obj.length; i++) {
                    arrayStr += indent+"\t"+scMain.dumpObj(obj[i], level+1)+",\n";
                }
                arrayStr += indent + "]";
            } else {
                arrayStr += "[]";
            }
            returnStr = arrayStr;
        } else if(obj.constructor.name == 'Object') {
            var objStr = "{\n";
            var foundProps = false;
            for(var prop in obj) {
                foundProps = true;
                objStr += indent+"\t"+prop+": "+scMain.dumpObj(obj[prop], level+1)+",\n";
            }
            objStr += indent + "}";
            if(!foundProps) {
                objStr = "{}";
            }
            returnStr = objStr;
        } else if(obj && obj.toString) {
            returnStr = obj.toString();
        } else if(obj && obj.constructor) {
            returnStr = obj.constructor.toString();
        } else {
            returnStr = 'invalid';
        }

        if(level == 0) {
            scMain.dump(returnStr);
        } else {
            return returnStr;
        }
    }
};
window.addEventListener('load',scMain.onload, true);
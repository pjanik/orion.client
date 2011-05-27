/******************************************************************************* 
 * Copyright (c) 2010, 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*global dojo dijit widgets*/
define(['dojo', 'dijit', 'dijit/Dialog', 'orion/widgets/_OrionDialogMixin'], function(dojo, dijit) {


/**
 * @param options {{ 
 *     func: function
 * }}
 */
dojo.declare("widgets.InitGitRepositoryDialog", [dijit.Dialog, widgets._OrionDialogMixin], {
	widgetsInTemplate: true,
	templateString: dojo.cache(new dojo._Url("/js/widgets/templates/InitGitRepositoryDialog.html")),
	
	constructor : function() {
		this.inherited(arguments);
		this.options = arguments[0] || {};
	},
	postMixInProperties : function() {
		this.inherited(arguments);
		this.title = "Init Git Repository";
		//this.gitTargetLabelText = "Target:";
		this.gitPathLabelText = "Existing directory:";
	},
	postCreate : function(){
		this.inherited(arguments);
		dojo.connect(this.existingDirectoryLink, "onclick", null, dojo.hitch(this, this.showExistingFolder));
		dojo.connect(this.openDirectoryPickerLink, "onclick", null, dojo.hitch(this, this.openDirectoryPickerDialog));
	},
	execute: function() {
		this.options.func(this.gitPath.value);
	},
	showExistingFolder: function(){
		this.basicSection.style.display = "none";
		this.existingProjectSection.style.display = "table-row";
		this.existingProjectSection_1.style.display = "table-row";
		this.openDirectoryPickerDialog();
	},
	openDirectoryPickerDialog: function(){
		var self = this;
		var dialog = new widgets.DirectoryPrompterDialog({
				title: "Choose a Folder",
				serviceRegistry: this.options.serviceRegistry,
				fileClient: this.options.fileClient,	
				func: dojo.hitch(this, function(targetFolder) {
					if (targetFolder && targetFolder.Location) {
						this.gitPath.value = targetFolder.Location;
						this.shownGitPath.innerHTML = "<a href='/navigate/table.html#"+targetFolder.ChildrenLocation+"'>"+targetFolder.Name+"</a>";
					}
				})
			});
			dialog.startup();
			dialog.show();
	}
});
});
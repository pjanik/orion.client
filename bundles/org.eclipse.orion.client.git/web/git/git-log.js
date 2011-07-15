/******************************************************************************* 
 * Copyright (c) 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*global window define document dijit */
/*browser:true*/
define(['dojo', 'orion/serviceregistry', 'orion/preferences', 'orion/pluginregistry', 'orion/status', 'orion/commands',
        'orion/auth', 'orion/dialogs', 'orion/selection', 'orion/fileClient', 'orion/searchClient', 'orion/globalCommands', 'orion/git/gitClient',
        'orion/breadcrumbs', 'orion/ssh/sshTools', 'orion/git/git-commit-details', 'orion/git/git-commit-navigator', 'orion/git/gitCommands',
	    'orion/links', 'dojo/parser', 'dojo/hash', 'dijit/layout/BorderContainer', 'dijit/layout/ContentPane', 'orion/widgets/eWebBorderContainer'], 
		function(dojo, mServiceregistry, mPreferences, mPluginRegistry, mStatus, mCommands, mAuth, mDialogs, mSelection, mFileClient,
					mSearchClient, mGlobalCommands, mGitClient, mBreadcrumbs, mSshTools, mGitCommitDetails, mGitCommitNavigator, mGitCommands, mLinks) {

var serviceRegistry;
dojo.addOnLoad(function() {
	document.body.style.visibility = "visible";
	dojo.parser.parse();
	
	// initialize service registry and EAS services
	serviceRegistry = new mServiceregistry.ServiceRegistry();
	var pluginRegistry = new mPluginRegistry.PluginRegistry(serviceRegistry);
	dojo.addOnUnload(function() {
		pluginRegistry.shutdown();
	});
	new mStatus.StatusReportingService(serviceRegistry, "statusPane", "notifications");
	new mDialogs.DialogService(serviceRegistry);
	var selection = new mSelection.Selection(serviceRegistry);
	new mSshTools.SshService(serviceRegistry);
	var preferenceService = new mPreferences.PreferencesService(serviceRegistry, "/prefs/user");
	var commandService = new mCommands.CommandService({serviceRegistry: serviceRegistry, selection: selection});
	var linkService = new mLinks.TextLinkService({serviceRegistry: serviceRegistry});
	
	var fileServices = serviceRegistry.getServiceReferences("orion.core.file");
	var fileServiceReference;
	var branch;
	
	
	for (var i=0; i<fileServices.length; i++) {
		var info = {};
		var propertyNames = fileServices[i].getPropertyNames();
		for (var j = 0; j < propertyNames.length; j++) {
			info[propertyNames[j]] = fileServices[i].getProperty(propertyNames[j]);
		}
		if (new RegExp(info.pattern).test(dojo.hash())) {
			fileServiceReference = fileServices[i];
		}
	}	
	
	// Git operations
	var gitClient = new mGitClient.GitService(serviceRegistry);
	
	var searcher = new mSearchClient.Searcher({serviceRegistry: serviceRegistry});
	
	// Commit details
	var commitDetails = new mGitCommitDetails.CommitDetails({parent: "commitDetailsPane", commandService: commandService, linkService: linkService, detailsPane: dijit.byId("orion.innerNavigator")});
	// Commit navigator
	var navigator = new mGitCommitNavigator.GitCommitNavigator(serviceRegistry, selection, commitDetails, null, "explorer-tree", "pageTitle", "pageActions", "selectionTools");
	
	// global commands
	mGlobalCommands.generateBanner("toolbar", serviceRegistry, commandService, preferenceService, searcher, navigator);
	
	//TODO this should be removed and contributed by a plug-in
	mGitCommands.createFileCommands(serviceRegistry, commandService, navigator, "pageActions", "selectionTools");
	
	// define the command contributions - where things appear, first the groups
	commandService.addCommandGroup("eclipse.gitGroup.nav", 200, "More");
	commandService.addCommandGroup("eclipse.gitGroup.page", 100, null, null, "pageActions");
	commandService.addCommandGroup("eclipse.selectionGroup", 500, "More actions", null, "selectionTools");
	
	// commands appearing directly in local actions column
	commandService.registerCommandContribution("eclipse.openGitCommit", 1);
	commandService.registerCommandContribution("eclipse.compareWithWorkingTree", 2);

	// selection based command contributions in nav toolbar
	commandService.registerCommandContribution("eclipse.compareGitCommits", 1, "selectionTools", "eclipse.selectionGroup");
	
	// git contributions
	commandService.registerCommandContribution("eclipse.orion.git.fetch", 100, "pageActions", "eclipse.gitGroup.page");
	commandService.registerCommandContribution("eclipse.orion.git.fetchforce", 100, "pageActions", "eclipse.gitGroup.page");
	commandService.registerCommandContribution("eclipse.orion.git.merge", 100, "pageActions", "eclipse.gitGroup.page");
	commandService.registerCommandContribution("eclipse.orion.git.switchToCurrentLocal", 100, "pageActions", "eclipse.gitGroup.page");	
	commandService.registerCommandContribution("eclipse.orion.git.push", 100, "pageActions", "eclipse.gitGroup.page");
	commandService.registerCommandContribution("eclipse.orion.git.pushforce", 100, "pageActions", "eclipse.gitGroup.page");
	commandService.registerCommandContribution("eclipse.orion.git.switchToRemote", 100, "pageActions", "eclipse.gitGroup.page");
	commandService.registerCommandContribution("eclipse.orion.git.addTag", 3);
	
	loadResource(fileServiceReference, navigator);
	
	makeRightPane(navigator);

	// every time the user manually changes the hash, we need to load the
	// workspace with that name
	dojo.subscribe("/dojo/hashchange", navigator, function() {
		loadResource(fileServiceReference, navigator);
	});
});

function loadResource(fileServiceReference, navigator){
	var path = dojo.hash();
	dojo.xhrGet({
		url : path,
		headers : {
			"Orion-Version" : "1"
		},
		handleAs : "json",
		timeout : 5000,
		load : function(resource, secondArg) {
			if (resource.Type === "RemoteTrackingBranch"){
				serviceRegistry.getService(fileServiceReference).then(function(fileService) {
					var fileClient = new mFileClient.FileClient(fileService);
					initTitleBar(fileClient, navigator, resource);
				});
		
				serviceRegistry.getService("orion.git.provider").then(function(gitService){
					gitService.getLog(resource.HeadLocation, resource.Id, function(scopedCommitsJsonData, secondArg) {
						navigator.renderer.setIncomingCommits(scopedCommitsJsonData);
						navigator.renderer.setOutgoingCommits([]);
						navigator.loadCommitsList(resource.CommitLocation + "?" + new dojo._Url(path).query, resource);	
					});
				});
			} else if (resource.toRef){
				serviceRegistry.getService(fileServiceReference).then(function(fileService) {
					var fileClient = new mFileClient.FileClient(fileService);
					initTitleBar(fileClient, navigator, resource);
				});

				if (resource.RemoteLocation)
					dojo.xhrGet({
						url : resource.RemoteLocation,
						headers : {
							"Orion-Version" : "1"
						},
						handleAs : "json",
						timeout : 5000,
						load : function(remoteJsonData, secondArg) {
							serviceRegistry.getService("orion.git.provider").then(function(gitService){
								gitService.getLog(remoteJsonData.CommitLocation, "HEAD", function(scopedCommitsJsonData, secondArg) {
									navigator.renderer.setIncomingCommits([]);
									navigator.renderer.setOutgoingCommits(scopedCommitsJsonData);
									navigator.loadCommitsList(dojo.hash(), resource);
								});
							});
						},
						error : function(error, ioArgs){
							navigator.loadCommitsList(dojo.hash(), resource);
						}
					});
				else
					navigator.loadCommitsList(dojo.hash(), resource);
			} else {
				navigator.loadCommitsList(dojo.hash(), {});
			}
		},
		error : function(error, ioArgs) {
			if(ioArgs.xhr.status == 401 || ioArgs.xhr.status == 403){ 
				mAuth.handleGetAuthenticationError(this, ioArgs);
			}else{
				navigator.loadCommitsList(dojo.hash(), error);	
			}
		}
	});
}

function getHeadFileUri(){
	var path = dojo.hash().split("gitapi/commit/");
	if(path.length === 2){
		path = path[1].split("/");
		if(path.length > 1){
			branch = path[0];
			fileURI="";
			for(var i=1; i<path.length-1; i++){
				//first segment is a branch name
				fileURI+= "/" + path[i];
			}
			fileURI+="/" + path[path.length-1].split("?")[0];
		}
	}
	return fileURI;
}

function getRemoteFileURI(){
	var path = dojo.hash().split("gitapi/remote/");
	if(path.length === 2){
		path = path[1].split("/");
		if(path.length > 2){
			branch = path[0]+"/"+path[1];
			fileURI="";
			for(var i=2; i<path.length-1; i++){
				//first two segments are a branch name
				fileURI+= "/" + path[i];
			}
			fileURI+="/" + path[path.length-1].split("?")[0];
		}
	}
	return fileURI;
}

function initTitleBar(fileClient, navigator, item){
	
	var isRemote = (item.Type === "RemoteTrackingBranch");
	
	//TODO we are calculating file path from the URL, it should be returned by git API
	var fileURI = isRemote ? getRemoteFileURI() : getHeadFileUri();
	
	
	if(fileURI){
		fileClient.read(fileURI, true).then(
				dojo.hitch(this, function(metadata) {
				var branchName, cloneName;
					if(item && (isRemote ? item.Name : item.toRef)){
						branchName = isRemote ? item.Name : item.toRef.Name;
					}
					if(item && (isRemote ? item.CloneLocation : item.toRef)){
						var cloneURI = isRemote ? item.CloneLocation : item.toRef.CloneLocation;
						
						serviceRegistry.getService("orion.git.provider").then(function(gitService){
							gitService.getGitClone(cloneURI).then(function(jsonData){
							if(jsonData.Children && jsonData.Children.length>0)
								setPageTitle(branchName, jsonData.Children[0].Name, jsonData.Children[0].ContentLocation, isRemote);
							else
								setPageTitle(branchName, jsonData.Name, jsonData.ContentLocation, isRemote);
							});
						});
					}else{
						setPageTitle(branchName);
					}
					var location = dojo.byId("location");
					if (location) {
						dojo.empty(location);
						var breadcrumb = new mBreadcrumbs.BreadCrumbs({
							container: "location",
							resource: metadata ,
							makeHref:function(seg,location){makeHref(fileClient, seg,location, isRemote);
							}
						});
					}
					navigator.isDirectory = metadata.Directory;
					mGitCommands.updateNavTools(serviceRegistry, navigator, "pageActions", "selectionTools", navigator._lastTreeRoot);
					navigator.updateCommands();
					if(metadata.Directory){
						//remove links to commit
						dojo.query(".navlinkonpage").forEach(function(node, i) {
							node.removeAttribute("href");
						});
					}
				}),
				dojo.hitch(this, function(error) {
					console.error("Error loading file metadata: " + error.message);
				})
		);
	}
	
};

function makeRightPane(explorer){
		// set up the splitter bar and its key binding
		var splitArea = dijit.byId("orion.innerNavigator");
		
		//by default the pane should be closed
		if(splitArea.isRightPaneOpen()){
			splitArea.toggle();
		}
				
		var bufferedSelection = [];
		
		window.document.onkeydown = function (evt){
			evt = evt || window.event;
			var handled = false;
			if(evt.ctrlKey && evt.keyCode  === 79){ // Ctrl+o handler for toggling outline 
				splitArea.toggle();
				handled = true;			
			} 
			if (handled) {
				if (window.document.all) { 
					evt.keyCode = 0;
				} else { 
					evt.preventDefault();
					evt.stopPropagation();
				}		
			}
		};
}

function makeHref(fileClient, seg, location, isRemote){
	if(!location){
		return;
	}
	fileClient.read(location, true).then(
			dojo.hitch(this, function(metadata) {
				if (isRemote) {
					serviceRegistry.getService("orion.git.provider").then(function(gitService){
						if(metadata.Git)
						gitService.getDefaultRemoteBranch(
								metadata.Git.RemoteLocation, function(
										defaultRemoteBranchJsonData, secondArg) {
									seg.href = "/git/git-log.html#"
											+ defaultRemoteBranchJsonData.Location
											+ "?page=1";
								});
					});

				} else {
					if(metadata.Git)
					seg.href = "/git/git-log.html#" + metadata.Git.CommitLocation
							+ "?page=1";
				}
			}),
			dojo.hitch(this, function(error) {
				console.error("Error loading file metadata: " + error.message);
			})
	);
};

function setPageTitle(branchName, cloneName, cloneLocation, isRemote){
	var pageTitle = dojo.byId("pageTitle");
	var title = "Git Log for " + (isRemote ? "remote branch <b>" : "local branch <b>") + branchName + "</b>";
	if(cloneLocation){
		title = title + " on <a href='/git/git-clone.html#" + cloneLocation + "'>" + cloneName + "</a>";
	}
	pageTitle.innerHTML = title;
	if(branchName){
		document.title = cloneName ? (branchName + " on " + cloneName) : branchName;
	}
}

});

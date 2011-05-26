/******************************************************************************* 
 * Copyright (c) 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*global window widgets eclipse:true serviceRegistry dojo */
/*browser:true*/

/**
 * @namespace The global container for eclipse APIs.
 */ 
var eclipse = eclipse || {};

/**
 * Utility methods
 * @namespace eclipse.gitCommandUtils generates commands
 */
 
eclipse.gitCommandUtils = eclipse.gitCommandUtils || {};

dojo.require("widgets.CloneGitRepositoryDialog");
dojo.require("widgets.InitGitRepositoryDialog");
dojo.require("widgets.AddRemoteDialog");
dojo.require("widgets.GitCredentialsDialog");

//this function is just a closure for the global "doOnce" flag
(function() {
	var doOnce = false;

	eclipse.gitCommandUtils.updateNavTools = function(registry, explorer, toolbarId, selectionToolbarId, item) {
		var toolbar = dojo.byId(toolbarId);
		if (toolbar) {
			dojo.empty(toolbar);
		} else {
			throw "could not find toolbar " + toolbarId;
		}
		registry.getService("orion.page.command").then(dojo.hitch(explorer, function(service) {
			service.renderCommands(toolbar, "dom", item, explorer, "image", null, null, true);  // true would force text links
			if (selectionToolbarId) {
				var selectionTools = dojo.create("span", {id: selectionToolbarId}, toolbar, "last");
				service.renderCommands(selectionTools, "dom", null, explorer, "image", null, null, true);  // true would force text links
			}
		}));
		
		// Stuff we do only the first time
		if (!doOnce) {
			doOnce = true;
			registry.getService("orion.page.selection").then(function(service) {
				service.addEventListener("selectionChanged", function(singleSelection, selections) {
					var selectionTools = dojo.byId(selectionToolbarId);
					if (selectionTools) {
						dojo.empty(selectionTools);
						registry.getService("orion.page.command").then(function(commandService) {
							commandService.renderCommands(selectionTools, "dom", selections, explorer, "image", null, null, true); // true would force text links
						});
					}
				});
			});
		}
	};
	
	eclipse.gitCommandUtils.handleKnownHostsError = function(serviceRegistry, errorData, options, func){
		if(confirm("Would you like to add " + errorData.KeyType + " key for host " + errorData.Host
				+ " to continue operation? Key fingerpt is " + errorData.HostFingerprint + ".")){
			serviceRegistry.getService("orion.net.ssh").then(function(sshService){
				sshService.addKnownHosts(errorData.Host + " " + errorData.KeyType + " " + errorData.HostKey).then(function(){
					sshService.getKnownHosts().then(function(knownHosts){
						options.knownHosts = knownHosts;
						func(options);
					});
				});
			});
		}
	};
	eclipse.gitCommandUtils.handleSshAuthenticationError = function(serviceRegistry, errorData, options, func, title, gitUrl){
					var credentialsDialog = new widgets.GitCredentialsDialog({
								title: title,
								url: gitUrl,
								serviceRegistry: serviceRegistry,
								func: func
							});		
					credentialsDialog.startup();
					credentialsDialog.show();
	};
	
	eclipse.gitCommandUtils.getDefaultSshOptions = function(serviceRegistry){
		var def = new dojo.Deferred();
		serviceRegistry.getService("orion.net.ssh").then(function(sshService) {
			sshService.getKnownHosts().then(function(knownHosts){
				def.callback({
							knownHosts: knownHosts,
							gitSshUsername: "",
							gitSshPassword: "",
							gitPrivateKey: "",
							gitPassphrase: ""
				});
			});
		});
		return def;
	};
	
	eclipse.gitCommandUtils.handleProgressServiceResponse = function(jsonData, options, serviceRegistry, callback, callee, title, gitUrl){
		if(jsonData.Running==false){
			if(jsonData.Result && jsonData.Result.HttpCode==403){
				if(jsonData.Result.ErrorData && jsonData.Result.ErrorData.HostKey){
					dojo.hitch(this, eclipse.gitCommandUtils.handleKnownHostsError)(serviceRegistry, jsonData.Result.ErrorData, options, callee);
					return;
				}
			} else if (jsonData.Result && jsonData.Result.HttpCode==401){
				dojo.hitch(this, eclipse.gitCommandUtils.handleSshAuthenticationError)(serviceRegistry, jsonData.Result.ErrorData, options, callee, title, gitUrl);
				return;
			}
			
			if(jsonData.Result && jsonData.Result.HttpCode!=200){
				console.error("error " + jsonData.Result.HttpCode + " while running opperation: " + jsonData.Result.DetailedMessage);
				return;
			}
			
			if(callback){
				callback(jsonData);
			}
			
		}
	};
	
	eclipse.gitCommandUtils.createFileCommands = function(serviceRegistry, commandService, explorer, toolbarId) {
		var cloneGitRepositoryCommand = new eclipse.Command({
			name : "Clone Repository",
			tooltip : "Clone Git Repository to Workspace",
			image : "/images/git-clone.gif",
			id : "eclipse.cloneGitRepository",
			callback : function(item) {
				var dialog = new widgets.CloneGitRepositoryDialog({
					func : function(gitUrl, path, name){
						eclipse.gitCommandUtils.getDefaultSshOptions(serviceRegistry).then(function(options){
									var func = arguments.callee;
									serviceRegistry.getService("orion.git.provider").then(function(gitService) {
										serviceRegistry.getService("orion.page.message").then(function(progressService) {
											var deferred = gitService.cloneGitRepository(name, gitUrl, path, explorer.defaultPath, options.gitSshUsername, options.gitSshPassword, options.knownHosts, options.gitPrivateKey, options.gitPassphrase);
											progressService.showWhile(deferred, "Cloning repository: " + gitUrl).then(
												function(jsonData, secondArg) {
													eclipse.gitCommandUtils.handleProgressServiceResponse(jsonData, options, serviceRegistry,
															function(jsonData){
																if(explorer.redisplayClonesList){
																	dojo.hitch(explorer, explorer.redisplayClonesList)();
																}
															}, func, "Clone Git Repository", gitUrl);
												});
										});
									});
								});
							}
				});
						
				dialog.startup();
				dialog.show();
			},
			visibleWhen : function(item) {
				return true;
			}
		});
		
		commandService.addCommand(cloneGitRepositoryCommand, "dom");
		
		var initGitRepositoryCommand = new eclipse.Command({
			name : "Init Repository",
			tooltip : "Init Git Repository in Workspace",
			id : "eclipse.initGitRepository",
			callback : function(item) {
				var dialog = new widgets.InitGitRepositoryDialog({
					func : function(target){
								serviceRegistry.getService("orion.git.provider").then(function(gitService) {
									gitService.initGitRepository(target).then(function(){
											if(explorer.redisplayClonesList){
												dojo.hitch(explorer, explorer.redisplayClonesList)();
											}
									});
								});

							}
				});
						
				dialog.startup();
				dialog.show();
			},
			visibleWhen : function(item) {
				return true;
			}
		});
		
		commandService.addCommand(initGitRepositoryCommand, "dom");
		
		// TODO: not used by the git clone navigator, could be removed
		var linkRepoCommand = new eclipse.Command({
			name: "Link Repository",
			image: "/images/link_obj.gif",
			id: "eclipse.linkRepository",
			callback: function(item) {
				var dialog = new widgets.NewItemDialog({
					title: "Link Repository",
					label: "Folder name:",
					func:  function(name, url, create){
						serviceRegistry.getService("orion.core.file").then(function(service){
							
							service.loadWorkspace("").then(function(loadedWorkspace){
								service.createProject(loadedWorkspace.Location, name, item.ContentLocation, false).then(
										function(jsonResp){
											alert("Repository was linked to " + jsonResp.Name);
											service.read(jsonResp.ContentLocation, true).then(function(jsonData){
												window.location.replace("/navigate/table.html#"+jsonData.ChildrenLocation); //redirect to the workspace to see the linked resource
											});
										}
									);
							});
							
						});
					},
					advanced: false
				});
				dialog.startup();
				dialog.show();
			},
			visibleWhen: function(item) {
				if(item.ContentLocation){
					return true;
				}
				return false;
				}
			});
		commandService.addCommand(linkRepoCommand, "object");
		
		var checkoutBranchCommand = new eclipse.Command({
			name: "Checkout",
			image: "/images/git-checkout.gif",
			id: "eclipse.checkoutBranch",
			callback: function(item) {
				serviceRegistry.getService("orion.git.provider").then(
					function(service) {
						service.checkoutBranch(item.CloneLocation, item.Name).then(
								function(){
									dojo.hitch(explorer, explorer.changedItem)(item.parent);
								});
					}
				);
			},
			visibleWhen: function(item) {
				return item.Type === "Branch" && !item.Current;
			}}
		);
		commandService.addCommand(checkoutBranchCommand, "object");
		
		var addBranchCommand = new eclipse.Command({
			name: "Add Branch",
			image: "/images/add_obj.gif",
			id: "eclipse.addBranch",
			callback: function(item) {
				var branchName = prompt("Enter branch name");
				serviceRegistry.getService("orion.git.provider").then(
					function(service) {
						service.addBranch(item.Location, branchName).then(function(){
							dojo.hitch(explorer, explorer.changedItem)(item);
						});
					}
				);
			},
			visibleWhen: function(item) {
				return item.GroupNode && item.Name === "Branch";
			}}
		);
		commandService.addCommand(addBranchCommand, "object");
		
		var removeBranchCommand = new eclipse.Command({
			name: "Remove Branch",
			image: "/images/remove.gif",
			id: "eclipse.removeBranch",
			callback: function(item) {
				serviceRegistry.getService("orion.git.provider").then(
					function(service) {
						service.removeBranch(item.Location).then(
								function(){
									dojo.hitch(explorer, explorer.changedItem)(item.parent);
								});
					}
				);
			},
			visibleWhen: function(item) {
				return item.Type === "Branch" && !item.Current;
			}}
		);
		commandService.addCommand(removeBranchCommand, "object");
		
		var addRemoteCommand = new eclipse.Command({
			name: "Add Remote",
			image: "/images/add_obj.gif",
			id: "eclipse.addRemote",
			callback : function(item) {
				var dialog = new widgets.AddRemoteDialog({
					func : function(remote, remoteURI){
								serviceRegistry.getService("orion.git.provider").then(function(gitService) {
									gitService.addRemote(item.Location, remote, remoteURI).then(
											function() {
												dojo.hitch(explorer, explorer.changedItem)(item);
											});
								});
							}
				});
				dialog.startup();
				dialog.show();
			},
			visibleWhen: function(item) {
				return item.GroupNode && item.Name === "Remote";
			}}
		);
		commandService.addCommand(addRemoteCommand, "object");
		
		var removeRemoteCommand = new eclipse.Command({
			name: "Remove Remote",
			image: "/images/remove.gif",
			id: "eclipse.removeRemote",
			callback: function(item) {
				serviceRegistry.getService("orion.git.provider").then(
					function(service) {
						service.removeRemote(item.Location).then(
								function(){
									dojo.hitch(explorer, explorer.changedItem)(item.parent);
								});
					}
				);
			},
			visibleWhen: function(item) {
				return item.Type === "Remote";
			}}
		);
		commandService.addCommand(removeRemoteCommand, "object");
		
		var openGitLog = new eclipse.Command({
			name : "Show Git Log",
			id : "eclipse.openGitLog",
			hrefCallback : function(item) {
				if (item.Type === "RemoteTrackingBranch")
					return "/git-log.html?remote#" + item.Location + "?page=1";
				return "/git-log.html#" + item.CommitLocation + "?page=1";
			},
			visibleWhen : function(item) {
				return item.Type === "Branch" || item.Type === "RemoteTrackingBranch";
			}
		});
	
		commandService.addCommand(openGitLog, "object");
		
		var compareGitCommits = new eclipse.Command({
			name : "Compare With Each Other",
			image : "/images/compare-sbs.gif",
			id : "eclipse.compareGitCommits",
			hrefCallback : function(item) {
				var clientDeferred = new dojo.Deferred();
				serviceRegistry.getService("orion.git.provider").then(
						function(service) {
							service.getDiff(item[0].DiffLocation, item[1].Name,
								function(jsonData, secondArg) {
									clientDeferred.callback("/compare/compare.html?readonly#" + secondArg.xhr.getResponseHeader("Location"));
								});
						});
				return clientDeferred;
			},
			visibleWhen : function(item) {
				if(explorer.isDirectory) return false;
				if (dojo.isArray(item) && item.length === 2) {
						return true;
				}
				return false;
			}
		});
	
		commandService.addCommand(compareGitCommits, "dom");
		
		var compareWithWorkingTree = new eclipse.Command({
			name : "Compare With Working Tree",
			image : "/images/compare-sbs.gif",
			id : "eclipse.compareWithWorkingTree",
			hrefCallback : function(item) {
				return "/compare/compare.html#" + item.object.DiffLocation;
			},
			visibleWhen : function(item) {
				// show only for commits in the git log list
				return item.dom === "explorer-tree" && !explorer.isDirectory;
			}
		});
	
		commandService.addCommand(compareWithWorkingTree, "object");
		
		var openGitCommit = new eclipse.Command({
			name : "Open",
			image : "/images/find.gif",
			id : "eclipse.openGitCommit",
			hrefCallback: function(item) {
				return "/edit/edit.html#" + item.object.ContentLocation;
			},
			visibleWhen : function(item) {
				// show only for commits in the git log list
				return item.dom === "explorer-tree" && item.object.ContentLocation != null && !explorer.isDirectory;
			}
		});
	
		commandService.addCommand(openGitCommit, "object");
		
		var fetchCommand = new eclipse.Command({
			name : "Fetch",
			image : "/images/git-fetch.gif",
			id : "eclipse.orion.git.fetch",
			callback: function(item) {
				var path = item.Location;
				eclipse.gitCommandUtils.getDefaultSshOptions(serviceRegistry).then(function(options){
						var func = arguments.callee;
						serviceRegistry.getService("orion.git.provider").then(function(gitService) {
							serviceRegistry.getService("orion.page.message").then(function(progressService) {
								var deferred = gitService.doFetch(path, null, options.gitSshUsername, options.gitSshPassword, options.knownHosts, options.gitPrivateKey, options.gitPassphrase);
								progressService.showWhile(deferred, "Fetching remote: " + path).then(
									function(jsonData, secondArg) {
										eclipse.gitCommandUtils.handleProgressServiceResponse(jsonData, options, serviceRegistry,
												function(jsonData){
													dojo.xhrGet({
														url : path,
														headers : {
															"Orion-Version" : "1"
														},
														postData : dojo.toJson({
															"GitSshUsername" : options.gitSshUsername,
															"GitSshPassword" : options.gitSshPassword,
															"GitSshPrivateKey": options.gitPrivateKey,
															"GitSshPassphrase": options.gitPassphrase,
															"GitSshKnownHost" : options.knownHosts
														}),
														handleAs : "json",
														timeout : 5000,
														load : function(jsonData, secondArg) {
															return jsonData;
														},
														error : function(error, ioArgs) {
															//handleGetAuthenticationError(this, ioArgs);
															console.error("HTTP status code: ", ioArgs.xhr.status);
														}
													}).then(function(remoteJsonData){
														if (explorer.parentId === "explorer-tree")
															gitService.getLog(remoteJsonData.HeadLocation, remoteJsonData.Id, function(scopedCommitsJsonData, secondArd) {
																explorer.renderer.setIncomingCommits(scopedCommitsJsonData);
																explorer.loadCommitsList(remoteJsonData.CommitLocation + "?page=1", remoteJsonData, true);			
															});
													});
												}, func, "Fetch Git Repository");
									});
							});
						});
					});	
			},
			visibleWhen : function(item) {
				return item.Type === "RemoteTrackingBranch" || item.Type === "Remote";
			}
		});
	
		commandService.addCommand(fetchCommand, "dom");
		commandService.addCommand(fetchCommand, "object");
		
		var mergeCommand = new eclipse.Command({
			name : "Merge",
			image : "/images/git-merge.gif",
			id : "eclipse.orion.git.merge",
			callback: function(item) {
				serviceRegistry.getService("orion.git.provider").then(function(gitService){
					gitService.doMerge(item.HeadLocation, item.Id).then(function(result){
						serviceRegistry.getService("orion.page.message").then(function(progressService){
							var display = [];
							
							if (result.jsonData.Result == "FAST_FORWARD" || result.jsonData.Result == "ALREADY_UP_TO_DATE"){
								dojo.query(".treeTableRow").forEach(function(node, i) {
									dojo.toggleClass(node, "incomingCommitsdRow", false);
								});
								display.Severity = "Ok";
								display.HTML = false;
								display.Message = result.jsonData.Result;
							}
							else{
								var statusLocation = item.HeadLocation.replace("commit/HEAD", "status");
								
								display.Severity = "Warning";
								display.HTML = true;
								display.Message = "<span>" + result.jsonData.Result
									+ ". Go to <a class=\"pageActions\" href=\"/git-status.html#" 
									+ statusLocation +"\">Git Status page</a>.<span>";
							}
								
							progressService.setProgressResult(display);
						});
					}, function (error) {
						serviceRegistry.getService("orion.page.message").then(function(progressService){
							var display = [];
							
							var statusLocation = item.HeadLocation.replace("commit/HEAD", "status");
							
							display.Severity = "Error";
							display.HTML = true;
							display.Message = "<span>" + dojo.fromJson(error.ioArgs.xhr.responseText).DetailedMessage
							+ ". Go to <a class=\"pageActions\" href=\"/git-status.html#" 
							+ statusLocation +"\">Git Status page</a>.<span>";
							
							progressService.setProgressResult(display);
						});
					});
				});
			},
			visibleWhen : function(item) {
				return item.Type === "RemoteTrackingBranch";
			}
		});
	
		commandService.addCommand(mergeCommand, "dom");
		commandService.addCommand(mergeCommand, "object");
		
		var pushCommand = new eclipse.Command({
			name : "Push",
			image : "/images/git-push.gif",
			id : "eclipse.orion.git.push",
			callback: function(item) {
				var path = dojo.hash();
				eclipse.gitCommandUtils.getDefaultSshOptions(serviceRegistry).then(function(options){
						var func = arguments.callee;
						serviceRegistry.getService("orion.git.provider").then(function(gitService) {
							serviceRegistry.getService("orion.page.message").then(function(progressService) {
								var deferred = gitService.doPush(item.Location, "HEAD", null, options.gitSshUsername, options.gitSshPassword, options.knownHosts, options.gitPrivateKey, options.gitPassphrase);
								progressService.showWhile(deferred, "Pushing remote: " + path).then(function(remoteJsonData){
									eclipse.gitCommandUtils.handleProgressServiceResponse(remoteJsonData, options, serviceRegistry,
											function(jsonData){
												if (jsonData.Result.Severity == "Ok")
													dojo.query(".treeTableRow").forEach(function(node, i) {
														dojo.toggleClass(node, "outgoingCommitsdRow", false);
													});
											}, func, "Push Git Repository");
									});
								});
							});
				});
			},
			visibleWhen : function(item) {
				return explorer.isRoot;
			}
		});
	
		commandService.addCommand(pushCommand, "dom");
		
		var addTagCommand = new eclipse.Command({
			name : "Tag",
			image : "/images/git-tag.gif",
			id : "eclipse.orion.git.addTag",
			callback : function(item) {
				var clientDeferred = new dojo.Deferred();
				var tagName = prompt("Enter tage name");
				serviceRegistry.getService("orion.git.provider").then(
						function(service) {
							service.doAddTag(item.object.Location, tagName,
								function(jsonData, secondArg) {
									var trId = jsonData.Location.replace(/[^\.\:\-\_0-9A-Za-z]/g, "");
									var tr = dojo.byId(trId);
									dojo.place(document.createTextNode(tagName), dojo.create("p", {style: "margin: 5px"}, tr.children[2] /* tags column */, "last"), "only");
								});
						});
				return clientDeferred;
			},
			visibleWhen : function(item) {
				// show only for commits in the git log list
				return item.dom === "explorer-tree";
			}
		});
	
		commandService.addCommand(addTagCommand, "object");
	};
	
	eclipse.gitCommandUtils.createGitClonesCommands = function(serviceRegistry, commandService, explorer, toolbarId) {
		var deleteCommand = new eclipse.Command({
			name: "Delete Clone",
			image: "/images/remove.gif",
			id: "eclipse.git.deleteClone",
			visibleWhen: function(item) {
				var items = dojo.isArray(item) ? item : [item];
				if (items.length === 0) {
					return false;
				}
				for (var i=0; i < items.length; i++) {
					if (!items[i].ContentLocation) {
						return false;
					}
				}
				return true;
			},
			callback: function(item) {
				if(dojo.isArray(item)){
					if(confirm("Are you sure you want do delete " + item.length + " repositories?")){
						var alreadyDeleted = 0;
						for(var i=0; i<item.length; i++){
							serviceRegistry.getService("orion.git.provider").then(function(gitService) {
								gitService.removeGitRepository(item[i].Location).then(
										function(jsonData){
											alreadyDeleted++;
											if(alreadyDeleted >= item.length && explorer.redisplayClonesList){
												dojo.hitch(explorer, explorer.redisplayClonesList)();
											}
										});
							});
						}
					}
				} else {
					if(confirm("Are you sure you want to delete " + item.Name + "?"))
					serviceRegistry.getService("orion.git.provider").then(function(gitService) {
						gitService.removeGitRepository(item.Location).then(
								function(jsonData){
									if(explorer.redisplayClonesList){
										dojo.hitch(explorer, explorer.redisplayClonesList)();
									}
								});
					});
				}
				
			}});
		commandService.addCommand(deleteCommand, "object");
		commandService.addCommand(deleteCommand, "dom");
		
	};
}());

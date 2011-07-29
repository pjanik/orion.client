/******************************************************************************* 
 * Copyright (c) 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*global dojo eclipse:true widgets*/
/*jslint regexp:false browser:true forin:true*/

define(['dojo', 'orion/explorer', 'orion/util', 'orion/git/gitCommands'], function(dojo, mExplorer, mUtil, mGitCommands) {

var exports =  {};
exports.GitCommitNavigator = (function() {
	/**
	 * Creates a new Git commit navigator.
	 * @name orion.git.GitCommitNavigator
	 * @class A table-based git commit navigator
	 */
	function GitCommitNavigator(serviceRegistry, selection, commitDetails, options, parentId, pageTitleId, toolbarId, selectionToolsId) {
		this.registry = serviceRegistry;
		this.selection = selection;
		this.checkbox = options != null ? options.checkbox : true;
		this.minimal = options != null ? options.minimal : false;
		this.parentId = parentId;
		this.pageTitleId = pageTitleId;
		this.toolbarId = toolbarId;
		this.selectionToolsId = selectionToolsId;
		this.isDirectory = true;
		this.model = null;
		this.myTree = null;
		this.commitDetails = commitDetails;
		this.renderer = new exports.GitCommitRenderer({checkbox: this.checkbox, cachePrefix: "GitCommitsNavigator", minimal: this.minimal}, this);
		if(this.commitDetails)
			this.commitDetails.render(null);
	}
	
	GitCommitNavigator.prototype = new mExplorer.Explorer();
	
	GitCommitNavigator.prototype.loadCommitsList = function(path, treeRoot, force) {

			path = mUtil.makeRelative(path);
			if (path === this._lastHash && !force) {
				return;
			}
						
			this._lastHash = path;
			this._lastTreeRoot = treeRoot;
			//dojo.hash(path, true);
			var parent = dojo.byId(this.parentId);

			// Progress indicator
			var progress = dojo.byId(parent.id + "progress"); 
			if(!progress){
				progress = dojo.create("div", {id: parent.id + "progress"}, parent, "only");
			}
			dojo.empty(progress);
			
			if(treeRoot.status && treeRoot.status!=200){
				var response = treeRoot.message;
				try {
					var obj = JSON.parse(treeRoot.responseText);
					if(obj.Message){
						response = obj.Message;
					} 
				} catch(error) {
					//it is not JSON, just continue;
				}
				if(treeRoot.status!=404 && response!=="")
					dojo.create("b", {innerHTML: "Error " + treeRoot.status + ": "}, progress, "only");
				dojo.place(document.createTextNode(response), progress, "last");
				
				if(this.toolbarId && this.selectionToolsId)
					mGitCommands.updateNavTools(this.registry, this, this.toolbarId, this.selectionToolsId, treeRoot);
				
				return;
			}
			
			b = dojo.create("b");
			dojo.place(document.createTextNode("Loading "), progress, "last");
			dojo.place(document.createTextNode(path), b, "last");
			dojo.place(b, progress, "last");
			dojo.place(document.createTextNode("..."), progress, "last");
			
			var self = this;

			if(this.toolbarId && this.selectionToolsId)
				mGitCommands.updateNavTools(this.registry, this, this.toolbarId, this.selectionToolsId, treeRoot);
						
			this.registry.getService("orion.git.provider").then(function(service){
				dojo.hitch(self, self.createTree(self.parentId, new mExplorer.ExplorerFlatModel(path, service.doGitLog)));
			});
			
		};
		
	GitCommitNavigator.prototype.loadCommitDetails = function(commitDetails) {
		if(this.commitDetails)
			this.commitDetails.loadCommitDetails(commitDetails);
	};
		
	GitCommitNavigator.prototype.markBranch = function(branchName) {
		// clear if some branch has been marked earlier
		if (this._markedBranch) {
			this.renderer.unmarkBranch(this._markedBranch);
		}
		
		// just branch unmarking, so return
		if (this._markedBranch === branchName) {
			this._markedBranch = null;
			return;
		}
		
		// begin marking proper commits
		// find which commit branch is pointing to
		var startCommit;
		dojo.forEach(this._lastTreeRoot.Children, function(commit, i) {
			dojo.forEach(commit.Branches, function(branch, i) {
				if (branch.FullName === branchName){
					startCommit = commit;
				}
			});
		});
		
		// BFS 
		var result = [];
		var visited = [];
		var queue = [];
		
		queue.push(startCommit.Name);
		visited[startCommit.Name] = true;
		
		while (queue.length > 0) {
			var commitName = queue.shift();
			result.push(commitName);
			// look for commit data 
			var commitData;
			dojo.forEach(this._lastTreeRoot.Children, function(commit, i) {
				if (commit.Name === commitName){
					commitData = commit;
				}
			});
			// add parents to queue
			dojo.forEach(commitData.Parents, function(parent, i) {
				if (!visited[parent.Name]) {
					queue.push(parent.Name);
					visited[parent.Name] = true;
				}
			});
		}
		
		// mark proper commits and branch name
		this.renderer.markBranch(branchName, result);
		
		// remember that branch is marked
		this._markedBranch = branchName;
	};
	
	return GitCommitNavigator;
}());

/********* Rendering json items into columns in the tree **************/


exports.GitCommitRenderer = (function() {
 	
	function GitCommitRenderer (options, explorer) {
		this._init(options);
		this.options = options;
		this.explorer = explorer;
	}
	GitCommitRenderer.prototype = mExplorer.SelectionRenderer.prototype;
	
	GitCommitRenderer.prototype.getCellHeaderElement = function(col_no){
		
		if (this.options['minimal'])
			return;
		
		switch(col_no){		
			case 0: 
				return dojo.create("th", {style: "padding-left: 5px; padding-right: 5px", innerHTML: "<h2>Message</h2>"});
				break;
			case 1:
				return dojo.create("th", {style: "padding-left: 5px; padding-right: 5px", innerHTML: "<h2>Author</h2>"});
				break;
			case 2:
				return dojo.create("th", {style: "padding-left: 5px; padding-right: 5px", innerHTML: "<h2>Date</h2>"});
				break;
			case 3:
				return dojo.create("th", {style: "padding-left: 5px; padding-right: 5px", innerHTML: "<h2>Actions</h2>"});
				break;
			case 4:
				return dojo.create("th", {style: "padding-left: 5px; padding-right: 5px", innerHTML: "<h2>Branches</h2>"});
				break;
			case 5:
				return dojo.create("th", {style: "padding-left: 5px; padding-right: 5px", innerHTML: "<h2>Tags</h2>"});
				break;
		};
		
	};
	
	GitCommitRenderer.prototype.setIncomingCommits = function(scopedCommits){
		this.incomingCommits = scopedCommits;
	};
	
	GitCommitRenderer.prototype.setOutgoingCommits = function(scopedCommits){
		this.outgoingCommits = scopedCommits;
	};
	
	GitCommitRenderer.prototype.getCellElement = function(col_no, item, tableRow){
		
		var incomingCommit = false;
		
		dojo.forEach(this.incomingCommits, function(commit, i){
			if (item.Name === commit.Name){
				incomingCommit = true;
			}
		});
		
		var outgoingCommit = false;
		
		dojo.forEach(this.outgoingCommits, function(commit, i){
			if (item.Name === commit.Name){
				outgoingCommit = true;
			}
		});

		switch(col_no){
		case 0:
			var col, div, link;

			col = document.createElement('td');
			div = dojo.create("div", {className: "gitCommitMessage"}, col, "only");
				
			link = dojo.create("a", {className: "navlinkonpage"}, div, "last");
			if(this.explorer.commitDetails){
				// clicking the link should update the commit details pane, if there is one
				dojo.connect(link, "onclick", link, dojo.hitch(this, function() {
					this.explorer.loadCommitDetails(item);	
				}));			
				dojo.connect(link, "onmouseover", link, function() {
					link.style.cursor = /*self._controller.loading ? 'wait' :*/"pointer";
				});
				dojo.connect(link, "onmouseout", link, function() {
					link.style.cursor = /*self._controller.loading ? 'wait' :*/"default";
				});
			}
			dojo.place(document.createTextNode(item.Message), link, "only");	
			
			if (incomingCommit)
				dojo.toggleClass(tableRow, "incomingCommitsdRow", true);
			else if (outgoingCommit)
				dojo.toggleClass(tableRow, "outgoingCommitsdRow", true);
			
			return col;
			break;
		case 1:
			return dojo.create("td", {style: "padding-left: 5px; padding-right: 5px", innerHTML: item.AuthorName + " (" + item.AuthorEmail + ")"});
			break;
		case 2:
			return dojo.create("td", {style: "padding-left: 5px; padding-right: 5px", innerHTML: dojo.date.locale.format(new Date(item.Time), {formatLength: "short"})});
			break;
		case 3:
			if (this.options['minimal'])
				break;
			
			var actionsColumn = this.getActionsColumn(item, tableRow);
			dojo.style(actionsColumn, "padding-left", "5px");
			dojo.style(actionsColumn, "padding-right", "5px");
			return actionsColumn;
			break;
		case 4:
			if (this.options['minimal'])
				break;
			
			var self = this;
			var td = document.createElement("td", {style: "padding-left: 5px; padding-right: 5px"});
			dojo.forEach(item.Branches, function(branch, i){
				var p = dojo.create("p", {id: branch.FullName, className: "branchNode", style: "margin: 5px"}, td, "last");
				var link = dojo.create("a", {className: "navlinkonpage"}, p, "last");
				dojo.connect(link, "onclick", link, dojo.hitch(this, function() {
					self.explorer.markBranch(branch.FullName);	
				}));			
				dojo.connect(link, "onmouseover", link, function() {
					link.style.cursor = /*self._controller.loading ? 'wait' :*/"pointer";
				});
				dojo.connect(link, "onmouseout", link, function() {
					link.style.cursor = /*self._controller.loading ? 'wait' :*/"default";
				});
				dojo.place(document.createTextNode(branch.FullName), link, "only");
			});
			return td;
			break;
		case 5:
			if (this.options['minimal'])
				break;
			
			var td = document.createElement("td", {style: "padding-left: 5px; padding-right: 5px"});
			dojo.forEach(item.Tags, function(tag, i){
				dojo.place(document.createTextNode(tag.Name), dojo.create("p", {style: "margin: 5px"}, td, "last"), "only");
			});
			return td;
			break;
		};
	};
	
	GitCommitRenderer.prototype.markBranch = function(branchName, branchCommits) {
		dojo.query(".treeTableRow").forEach(function(node, i) {
			var isInResultSet = false;
			dojo.forEach(branchCommits, function(commitName, i) {
				if (node.id.indexOf(commitName) != -1) {
					isInResultSet = true;	
				}
			});
			if (!isInResultSet) {
				dojo.toggleClass(node, "gitOtherBranch", true);
			}
		});
		dojo.query(".branchNode").forEach(function(node, i) {
				dojo.toggleClass(node, "gitOtherBranch", true);
		});
		var selectedBranchNode = dojo.byId(branchName);
		dojo.toggleClass(selectedBranchNode, "gitOtherBranch", false);
	};
	
	GitCommitRenderer.prototype.unmarkBranch = function(branchName) {
		dojo.query(".treeTableRow").forEach(function(node, i) {
			dojo.toggleClass(node, "gitOtherBranch", false);
		});
		dojo.query(".branchNode").forEach(function(node, i) {
			dojo.toggleClass(node, "gitOtherBranch", false);
		});
	};
	
	return GitCommitRenderer;
}());
return exports;
});


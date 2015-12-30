function backingScale(context) {
  if ('devicePixelRatio' in window) {
    if (window.devicePixelRatio > 1) {
      return window.devicePixelRatio;
    }
  }
  return 1;
}

Template.documentGraph.onCreated(function () {
  var self = this;
  
  self.force = d3.layout.force();

  self.force.lineWidth = 1.5;
  self.force.strokeStyle = 'grey';


  self.force
    .gravity(0)
    .charge(0)
    .friction(0.8)
    .linkDistance(function (link) {
      var from = link.source;
      var to = link.target;
      return self.margin + Math.sqrt( Math.pow(from.w + to.w, 2) + Math.pow(from.h + to.h, 2) );
    });

  if (self.data.onCreated) {
    //  give access to the force graph
    //  so client can set options
    self.data.onCreated(self.force);
  }

  self.graph = d3.select(self.firstNode);

  self.numNodes = new ReactiveVar(0);

  self.idToInLink = {};
  self.idToOutLink = {};

  self.groupTypeToInstance = {};

  self.margin = 20;
  self.edgeConstraintStrength = 1

  self.nodes = self.force.nodes();
  self.links = self.force.links();
});

Template.documentGraph.helpers({
  groupSettings : function () {
    return function (force) {
      force
        .gravity(-0.01)
        .charge(-1000)
        .friction(0.8)
        .linkDistance(function (link) {
          return 0;
        })
        .linkStrength(function (link) {
          return 0.01;
        });
    }
  }
});

Template.documentGraph.onRendered(function () {
  var self = this;

  self.width = $(this.firstNode).width();
  self.height = $(this.firstNode).height();

  self.canvas = self.$('.document-graph-canvas')[0];
  self.canvas.width = self.width;
  self.canvas.height = self.height;
  self.canvasContext = self.canvas.getContext('2d');

  self.scaleFactor = backingScale(self.canvasContext);

  if (self.scaleFactor > 1) {
      self.canvas.width = self.canvas.width * self.scaleFactor;
      self.canvas.height = self.canvas.height * self.scaleFactor;
      // update the context for the new canvas scale
      self.canvasContext = self.canvas.getContext("2d");
  }

  $(self.canvas).css({
    width  : self.canvas.width/self.scaleFactor,
    height : self.canvas.height/self.scaleFactor,
  })


  self.force.size([self.width, self.height]);

  self.force.on("tick", function () {
    self.offset = $(self.firstNode).offset();
    var context = self.canvasContext;

    context.clearRect(0, 0, self.canvas.width, self.canvas.height);

    var alpha = self.force.alpha();

    var nodes = self.force.nodes().slice(0);
    var node = nodes.pop();

    

    var lastTouched = { lastTouch : -Infinity };
    self.force.nodes().forEach(function (nodeData) {
      if (nodeData.lastTouch > lastTouched.lastTouch) {
        lastTouched = nodeData;
      }
      nodeData.fixed = false;
    });
    lastTouched.fixed = true;

    self.nodes.forEach(function (node1) {
      //  push node into view
      if (node1.fixed) return;
      if (node1.x - node1.w/2 < self.margin)               node1.x += (node1.w/2 - node1.x + self.margin) * alpha * self.edgeConstraintStrength;
      if (node1.x + node1.w/2 > self.width - self.margin)  node1.x -= (node1.x + node1.w/2 - self.width + self.margin) * alpha * self.edgeConstraintStrength;
      if (node1.y - node1.h/2 < self.margin)               node1.y += (node1.h/2 - node1.y + self.margin) * alpha;
      if (node1.y + node1.h/2 > self.height - self.margin) node1.y -= (node1.y + node1.h/2 - self.height + self.margin) * alpha * self.edgeConstraintStrength;
    });

    while (node) {
      node.overlapping.splice(0, node.overlapping.length);
      for (var i=0; i<nodes.length; i++) {
        var overlappingX = Math.abs(node.x - nodes[i].x) < (node.w + nodes[i].w)/2 + self.margin;
        var overlappingY = Math.abs(node.y - nodes[i].y) < (node.h + nodes[i].h)/2 + self.margin;
        if (overlappingX && overlappingY) {
          node.overlapping.push(nodes[i]);
        }
      }
      node = nodes.pop();
    }

    self.nodes.forEach(function (node1) {
      //  push overlapping nodes off of eachother
      node1.overlapping.forEach(function (node2) {
        var overlapX = (node1.w + node2.w)/2 - Math.abs(node1.x - node2.x) + self.margin;
        var overlapY = (node1.h + node2.h)/2 - Math.abs(node1.y - node2.y) + self.margin;
        overlap = Math.min(overlapX, overlapY);

        if (overlapY > self.margin) { //  prevent from sliding to corner
          if (node2.x < node1.x) {
            if (!node2.fixed) node2.x -= overlap*alpha;
            if (!node1.fixed) node1.x += overlap*alpha;
          }
          else {
            if (!node2.fixed) node2.x += overlap*alpha;
            if (!node1.fixed) node1.x -= overlap*alpha;
          }
        }

        if (overlapX > self.margin) { //  prevent from sliding to corner
          if (node2.y < node1.y) {
            if (!node2.fixed) node2.y -= overlap*alpha;
            if (!node1.fixed) node1.y += overlap*alpha;
          }
          else {
            if (!node2.fixed) node2.y += overlap*alpha;
            if (!node1.fixed) node1.y -= overlap*alpha;
          }
        }
      });

      //  TODO: pull nodes toward groups
    });

    self.force.nodes().forEach(function (nodeData) {
      var x = Math.round(nodeData.x - nodeData.w/2);
      var y = Math.round(nodeData.y - nodeData.h/2)
      $(nodeData.element).css({
        transform : 'translate(' + x + 'px, ' + y + 'px) '
                  + 'scale(' + nodeData.scale + ')'
      });
    });

    //  draw links
    //  TODO: process in z order
    self.links.forEach(function (link) {
      var source = $(link.sourceElement);
      var target = $(link.targetElement);
      var sourceOffset = source.offset();
      var targetOffset = target.offset();

      var sx = (sourceOffset.left - self.offset.left) * self.scaleFactor;
      var sy = (sourceOffset.top  - self.offset.top) * self.scaleFactor;
      var sw = source.width() * self.scaleFactor;
      var sh = source.height() * self.scaleFactor;

      var tx = (targetOffset.left - self.offset.left) * self.scaleFactor;
      var ty = (targetOffset.top  - self.offset.top) * self.scaleFactor;
      var tw = target.width() * self.scaleFactor;
      var th = target.height() * self.scaleFactor;

      context.beginPath();
      context.moveTo(
        parseInt(sx + sw/2),
        parseInt(sy  + sh/2));

      context.lineTo(
        parseInt(tx + tw/2),
        parseInt(ty + th/2));
      context.closePath();

      context.lineWidth = self.force.lineWidth;
      context.strokeStyle = self.force.strokeStyle;
      context.stroke();

      context.clearRect(sx, sy, sw, sh);
      context.clearRect(tx, ty, tw, th);
    });

    
  });

  self.force.start();
  self.started = true;
});

Template.documentGraph.onDestroyed(function () {
  this.force.stop();
});

function cleanInAndOutLinks(template, link) {
  var inLinks  = template.idToInLink[link.id];
  var outLinks = template.idToOutLink[link.id];

  for (var i=0; i<inLinks.length; i++) {
    if (inLinks[i] == link) {
      inlinks.splice(i, 1);
      i -= 1;
    }
  }

  for (var i=0; i<outLinks.length; i++) {
    if (outLinks[i] == link) {
      outLinks.splice(i, 1);
      i -= 1;
    }
  }
}


Template.documentGraph.events({
  'resize' : function (event, template) {
    template.width = $(template.firstNode).width();
    template.height = $(template.firstNode).height();
    template.$('.document-graph-canvas')
            .attr( 'width', self.width)
            .attr('height', self.height);
    template.force.size([width, height]);
  },
  'addnode' : function (event, template) {
    event.stopPropagation();

    event.nodeData.x  = template.width/2 + (Math.random() - 0.5)*2;
    event.nodeData.y  = template.height/2 + (Math.random() - 0.5)*2;
    event.nodeData.px = template.width/2 + (Math.random() - 0.5)*2;
    event.nodeData.py = template.height/2 + (Math.random() - 0.5)*2;
    event.nodeData.force = template.force;

    template.nodes.push(event.nodeData);
    if (template.started) template.force.start();
  },
  'removenode' : function (event, template) {
    event.stopPropagation();

    var nodes = template.force.nodes();
    for (var i=0; i<nodes.length; i++) {
      if (nodes[i].context = event.nodeData.context) {
        nodes.splice(i, 1);
        break;
      }
    }
  },
  'addgroup' : function (event, template) {
    var group = event.group;
    if (event.passed_group_layer) {
      //  capture addgroup after it has passed the group layer
      event.stopPropagation();
      template.groupTypeToInstance[group.type] = event.groupNodeData;
    }
    else {
      event.passed_group_layer = true;
    }
  },
  'addgroupmember' : function (event, template) {
    console.log('added group member', event);
  },
  'addoutlink' : function (event, template) {
    event.stopPropagation();

    var outLink = event.linkData;

    var inLinks = template.idToInLink[event.linkData.id] || [];
    template.idToInLink[event.linkData.id] = inLinks;

    var outLinks = template.idToOutLink[event.linkData.id] || [];
    template.idToOutLink[event.linkData.id] = outLinks;

    inLinks.forEach(function (inLink) {
      var linkData = {
        id : event.linkData.id,
        sourceElement : outLink.element,
        targetElement : inLink.element,
        source : outLink.document.nodeData,
        target : inLink.document.nodeData
      };
      var addLinkEvent = $.Event("addlink", { linkData : linkData });
      $(template.firstNode).trigger(addLinkEvent);
    });

    outLinks.push(outLink);
  },
  'addinlink' : function (event, template) {
    event.stopPropagation();

    var inLink = event.linkData;

    var inLinks = template.idToInLink[event.linkData.id] || [];
    template.idToInLink[event.linkData.id] = inLinks;

    var outLinks = template.idToOutLink[event.linkData.id] || [];
    template.idToOutLink[event.linkData.id] = outLinks;

    outLinks.forEach(function (outLink) {
      var linkData = {
        id : event.linkData.id,
        sourceElement : outLink.element,
        targetElement : inLink.element,
        source : outLink.document.nodeData,
        target : inLink.document.nodeData
      };
      var addLinkEvent = $.Event("addlink", { linkData : linkData });
      $(template.firstNode).trigger(addLinkEvent);
    });

    inLinks.push(inLink);
  },
  'addlink' : function (event, template) {
    event.stopPropagation();

    var linkData = event.linkData;
    var exists = false;
    for (var i=0; i<template.links.length; i++) {
      var link = template.links[i];
      exists  = linkData.sourceElement == link.sourceElement
             &&  linkData.source == link.source
             &&  linkData.target == link.target;
      // if exact link already exists
      // we don't need to add a new one
      if (exists) break;
    }

    //  TODO: can check existance before this point
    //  by (in addinlink/addoutlink handler) hashing
    //  link properties and checking
    if (!exists) {
      template.links.push(linkData);
      if (template.started) template.force.start();
    }
  },
  'removeoutlink' : function (event, template) {
    event.stopPropagation();

    var sourceElement = event.linkData.element;
    for (var i=0; i<template.links.length; i++) {
      var link = template.links[i];
      //  remove link if it is part of this our link
      if (link.sourceElement == sourceElement) {
        template.links.splice(i, 1);
        i -= 1;
        //  remove link from cache
        cleanInAndOutLinks(template, link);
      }
    }
    if (template.started) template.force.start();
  },
  'removeinlink' : function (event, template) {
    event.stopPropagation();

    var targetElement = event.linkData.element;
    for (var i=0; i<template.links.length; i++) {
      var link = template.links[i];
      //  remove link if it is part of this our link
      if (link.targetElement == targetElement) {
        template.links.splice(i, 1);
        i -= 1;
        //  remove link from cache
        cleanInAndOutLinks(template, link);
      }
    }
    if (template.started) template.force.start();
  }
});

Template.documentGraphDocument.onCreated(function () {
  this.nodeData = {};
});

Template.documentGraphDocument.onRendered(function () {
  var template = this;
  var maxW = 64;
  var maxH = 64;
  
  var w = $(this.firstNode).width();
  var h = $(this.firstNode).height();
  var scale = Math.min(maxW/w, maxH/h);
  scale = 1;
  this.nodeData.scale = scale;
  this.nodeData.w = w * scale;
  this.nodeData.h = h * scale;
  this.nodeData.overlapping = [];
  this.nodeData.context = this.data.data;
  this.nodeData.element = this.firstNode;
  this.nodeData.template = this;

  $(template.nodeData.element).on('elementresize', function (event) {
    //  reheat when element resizes
    if (event.target == template.nodeData.element) {
      //  keep contained in same width and height
      var w = $(template.firstNode).width();
      var h = $(template.firstNode).height();
      var scale = Math.min(maxW/w, maxH/h);
      scale = 1;
      template.nodeData.scale = scale;
      template.nodeData.w = $(template.firstNode).width() * scale;
      template.nodeData.h = $(template.firstNode).height() * scale;
      template.nodeData.force.resume();
    }
  });

  var addNodeEvent = $.Event("addnode", { nodeData : this.nodeData });
  $(this.firstNode).trigger(addNodeEvent);
});

Template.documentGraphDocument.onDestroyed(function () {
  var removeNodeEvent = $.Event("removenode", { nodeData : this.nodeData });
  $(this.firstNode).trigger(removeNodeEvent);
});

//  add the link's template
Template.documentGraphDocument.events({
  'addoutlink' : function (event, template) {
    event.linkData.document = template;
  },
  'addgroup' : function (event, template) {
    // add current node data as group data so parent can track group node position
    event.groupNodeData = template.nodeData;
  },
  'addgroupmember' : function (event, template) {
    //  add group type to current node
  }, 
  'removeoutlink' : function (event, template) {
    event.linkData.document = template;
  },
  'addinlink' : function (event, template) {
    event.linkData.document = template;
  },
  'removeinlink' : function (event, template) {
    event.linkData.document = template;
  },
  'touch, hover' : function (event, template) {
    template.nodeData.lastTouch = Date.now();
  },
  'drag' : function (event, template) {
    template.nodeData.px += event.dx;
    template.nodeData.py += event.dy;
    template.nodeData.force.resume();
  },
  'doubletap' : function (event, template) {
  },
  'drop' : function (event, template) {
    
  }
});

//  on rendered
//////////////////

Template.documentGraphOutLink.onRendered(function () {
  this.linkData = {
    id : this.data.id,
    element : this.firstNode
  };
  var addOutLinkEvent = $.Event("addoutlink", { linkData : this.linkData });
  $(this.firstNode).trigger(addOutLinkEvent);
});

Template.documentGraphInLink.onRendered(function () {
  this.linkData = {
    id : this.data.id,
    element : this.firstNode
  };
  var addInLinkEvent = $.Event("addinlink", {linkData : this.linkData});
  $(this.firstNode).trigger(addInLinkEvent);
});


Template.documentGraphGroup.onRendered(function () {
  var addGroupEvent = $.Event("addgroup", {group : this.data.data});
  $(this.firstNode).trigger(addGroupEvent);
});

Template.documentGraphGroupMember.onRendered(function () {
  var addGroupMemberEvent = $.Event("addgroupmember", {});
  $(this.firstNode).trigger(addGroupMemberEvent);
});


//  on destroyed
//////////////////

//  the removal of a link happens whenever
//  the in and/or out link is destroyed

Template.documentGraphOutLink.onDestroyed(function () {
  var removeOutLinkEvent = $.Event("removeoutlink", { linkData : this.linkData });
  $(this.linkData.element).trigger(removeOutLinkEvent);
});

Template.documentGraphInLink.onDestroyed(function () {
  var removeInLinkEvent = $.Event("removeinlink", { linkData : this.linkData });
  $(this.linkData.element).trigger(removeInLinkEvent);
});
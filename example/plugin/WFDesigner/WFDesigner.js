if (typeof WFDOnActiveClass == "undefined") {
    var WFDOnActiveClass = {
        DrawNode: 1,
        DrawingNode:2,
        DrawLine: 3,
        DrawingLine:4,
        ResizeNode: 5,
        ResizeLine: 6,
        None: 9
    }
}
if (typeof WFDNodeClass == "undefined") {
    var WFDNodeClass = {
        Begin: 1,
        End: 2,
        Active: 3,
        Judge: 4,
        Children:5
    }
}
(function () {
    "use strict";
    var WFDesigner = this.WFDesigner = function (domID) {
        var WFDrawer = null;//当前的绘图器
        var WFDrawerL = null;//当前的绘图器中的所有线
        var WFDrawerLDrag = null;//当前的绘图器中的所有线上的拖动点
        var WFDrawerN = null;//当前的绘图器中的所有结点

        var WFDOnActive = WFDOnActiveClass.None;//当前绘图器正在进行的工作       
        var WFDOnActiveElement = null;//当前绘图器正在进行的工作对象
        var WFDLastClickRecord = null;//svg的上一次点击事件的记录(专用于画线)


        var WFD_DRAG_CIRCLE_R = 7;//线上的拖动点直径！
        var WFD_DOCK_CIRCLE_R = 10;//结点上的停靠点直径！
        var WFD_BEGIN_END_NODE_R = 30;//开始结束结点的直径！
        var WFD_JUDGE_NODE_SIZE = 40;//条件结点的高宽！
        var WFDLinkLineList = {};//图中的所有线
        var WFDLinkLineMarkerModel = {//图中的所有线的marker的模板
            marker_s: null,
            marker_e: null,
            marker_s_c: null,
            marker_e_c: null
        }

        var WFDNodeList = {};//图中的所有节点
        var WFDNodeDockerList = {};//图中的所有节点上的Docker
        var WFDSizeDrawer = null;//图中用来画大小的rect

        //私有公用方法
        function IsIE() { //内部函数判断是否是IE
            if (!!window.ActiveXObject || "ActiveXObject" in window)
                return true;
            else
                return false;
        }

        //判断是否是自身或子结点
        function IsSelfORChildElement(ChildElementID, ParentElementID) {
            if (ChildElementID == ParentElementID) {
                return true;
            } else {
                var thisElement = SVG.get(ChildElementID);
                if (thisElement) {
                    var thisParentElement = SVG.get(ChildElementID).parent();
                    if (thisParentElement && thisParentElement.node) {
                        if (thisParentElement.node.id == ParentElementID) {
                            return true;
                        } else {
                            if (thisParentElement.type != "svg") {
                                return IsSelfORChildElement(thisParentElement.node.id, ParentElementID);
                            }
                        }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }

        //node的Docker的点击事件(响应在画线时的第一个点的点击，用于判定线的起始docker)
        function OnClickDocker(event) {
            var a = event;
            //当在画线
            if (WFDOnActive == WFDOnActiveClass.DrawLine) {
                if (event.target) {
                    if (WFDOnActiveElement.Line.type == "polyline") {
                        //画第一个点
                        if (WFDOnActiveElement.Line.array().value.length == 1) {
                            //设置 当前线的开始粘附结点
                            WFDOnActiveElement.StartNode = WFDNodeList[WFDNodeDockerList[event.target.id]["NodeID"]];
                            //设置 当前线的开始粘附结点的Docker索引
                            WFDOnActiveElement.StartDockerIndex = WFDNodeDockerList[event.target.id]["DockerIndex"];
                            //设置 粘附着当前线的结点 的 起始点粘附线信息
                            WFDNodeList[WFDNodeDockerList[event.target.id]["NodeID"]]["DockLineStart"][WFDOnActiveElement.ID] = WFDNodeDockerList[event.target.id]["DockerIndex"];
                        }
                    }
                }
            }
        }

        //node的Docker的MouseOver事件(响应当线的开始、结束点被拖入docker中的事件)
        function OnDragEnterDocker(event) {
            console.log("MouseOver");
        }

        function OnDragLeaveDocker(event) {
            console.log("MouseOut");

        }

        //中止所有正在进行的工作
        function StopAll() {
            switch (WFDOnActive) {
                case WFDOnActiveClass.DrawLine: {

                    WFDOnActive = WFDOnActiveClass.None;
                    if (WFDOnActiveElement) {
                        delete WFDLinkLineList[WFDOnActiveElement.ID];
                        WFDOnActiveElement.Line.draw('cancel');
                        WFDOnActiveElement.Line.remove();
                        WFDOnActiveElement = null;
                    }
                    break;
                }
                case WFDOnActiveClass.DrawingLine: {

                    WFDOnActive = WFDOnActiveClass.None;
                    if (WFDOnActiveElement) {
                        delete WFDLinkLineList[WFDOnActiveElement.ID];
                        WFDOnActiveElement.Line.draw('cancel');
                        WFDOnActiveElement.Line.remove();
                        WFDOnActiveElement = null;
                    }
                    break;
                }
                case WFDOnActiveClass.DrawNode: {
                    WFDOnActive = WFDOnActiveClass.None;
                    if (WFDSizeDrawer) {
                        WFDSizeDrawer.draw('cancel');
                        WFDSizeDrawer.remove();
                        WFDSizeDrawer = null;
                    }
                    break;
                }
                case WFDOnActiveClass.DrawingNode: {
                    if (WFDSizeDrawer) {
                        WFDSizeDrawer.draw('cancel');
                        WFDSizeDrawer.remove();
                        WFDSizeDrawer = null;
                    }
                    break;
                }
                case WFDOnActiveClass.ResizeLine: {
                    for (var i = 0; i < WFDOnActiveElement.DragCircle.length; i++) {
                        WFDOnActiveElement.DragCircle[i].hide();
                    }
                    WFDOnActive = WFDOnActiveClass.None;
                    WFDOnActiveElement = null;

                    break;
                }
                case WFDOnActiveClass.ResizeNode: {
                    WFDOnActiveElement.Node.get(0).selectize(false).resize("stop");
                    WFDOnActiveElement = null;
                    WFDOnActive = WFDOnActiveClass.None;
                    break;

                }
            }
            
        }

        //SVG上的点击事件
        function OnClick(event) {
            if (WFDOnActive == WFDOnActiveClass.None) {
                return;
            }


            //当正在画线
            if (WFDOnActive == WFDOnActiveClass.DrawingLine || WFDOnActive == WFDOnActiveClass.DrawLine) {

                if (event.target) {

                    if (WFDOnActiveElement.Line.type == "polyline") {
                        //画了第一个点
                        if (WFDOnActiveElement.Line.array().value.length == 1) {
                            WFDOnActive = WFDOnActiveClass.DrawingLine;
                            if (!IsIE()) {
                                WFDOnActiveElement.Line.marker('start', WFDLinkLineMarkerModel.marker_s);
                                WFDOnActiveElement.Line.marker('end', WFDLinkLineMarkerModel.marker_e);
                            }
                        }

                        var thisClickRecord = {
                            time: new Date,
                            xy: [event.x, event.y]
                        }

                        if (WFDLastClickRecord) {
                            if ((thisClickRecord.time - WFDLastClickRecord.time < 1000)
                                && Math.abs(thisClickRecord.xy[0] - WFDLastClickRecord.xy[0]) < 5
                                && Math.abs(thisClickRecord.xy[1] - WFDLastClickRecord.xy[1]) < 5
                                && WFDOnActiveElement.Line.array().value.length > 2
                            ) {
                                //在短时间短距离内点击了两次（中止画线）
                                WFDOnActiveElement.Line.draw('done');

                                //当前线的拖动点列表
                                var thisLinePointList = WFDOnActiveElement.Line.array().value;

                                for (var i = 0; i < thisLinePointList.length; i++) {
                                    var thisDragCircle = WFDrawerLDrag.circle(WFD_DRAG_CIRCLE_R).fill('#fff').draggable();
                                    thisDragCircle.stroke({
                                        width: 1,
                                        color: 'black'
                                    });
                                    thisDragCircle.hide();
                                    thisDragCircle.data("LineID", WFDOnActiveElement.ID);
                                    thisDragCircle.data("PointIndex", i);
                                    thisDragCircle.move(thisLinePointList[i][0] - WFD_DRAG_CIRCLE_R / 2, thisLinePointList[i][1] - WFD_DRAG_CIRCLE_R / 2);
                                    thisDragCircle.on('dragmove.namespace', function (event) {
                                        var event_DragCircle = SVG.get(event.target.id);
                                        var event_DragLine = SVG.get(event_DragCircle.data("LineID"));
                                        var thisLinePointList = event_DragLine.array().value;
                                        thisLinePointList[event_DragCircle.data("PointIndex")] = [event_DragCircle.cx(), event_DragCircle.cy()];
                                        event_DragLine.plot(thisLinePointList);

                                    });
                                    thisDragCircle.on('dragend.namespace', function (event) {
                                        var event_DragCircle = SVG.get(event.target.id);
                                        var event_DragLine = SVG.get(event_DragCircle.data("LineID"));
                                        var thisLinePointList = event_DragLine.array().value;
                                        thisLinePointList[event_DragCircle.data("PointIndex")] = [event_DragCircle.cx(), event_DragCircle.cy()];
                                        event_DragLine.plot(thisLinePointList);
                                        //判断是否是线的开始结束拖动点
                                        if (event_DragCircle.data("PointIndex") == 0) {
                                            //开始点
                                            //查找最后一个点是否落在某一个docker中
                                            var LineStartX = thisLinePointList[0][0];
                                            var LineStartY = thisLinePointList[0][1];
                                            for (var thisNodeID in WFDNodeList) {
                                                var breakNodeList = false;
                                                for (var i = 0; i < 4; i++) {

                                                    if (Math.abs(WFDNodeList[thisNodeID].Dockers[i].rbox().cx - WFDrawer.rbox().addOffset().x - LineStartX) < WFD_DOCK_CIRCLE_R / 2
                                                        && Math.abs(WFDNodeList[thisNodeID].Dockers[i].rbox().cy - WFDrawer.rbox().addOffset().y - LineStartY) < WFD_DOCK_CIRCLE_R / 2
                                                    ) {
                                                        //落于当前Docker中
                                                        //如以前已经粘附在其它结点，首先需要脱离
                                                        if (WFDOnActiveElement.StartNode) {
                                                            delete WFDNodeList[WFDOnActiveElement.StartNode.ID]["DockLineStart"][WFDOnActiveElement.ID];
                                                        }
                                                        
                                                        //设置 当前线的开始粘附结点
                                                        WFDLinkLineList[WFDOnActiveElement.ID].StartNode = WFDNodeList[thisNodeID];
                                                        //设置 当前线的开始附结点的Docker索引
                                                        WFDLinkLineList[WFDOnActiveElement.ID].StartDockerIndex = i;
                                                        //设置 粘附着当前线的结点 的 开始点粘附线信息
                                                        WFDNodeList[thisNodeID]["DockLineStart"][WFDOnActiveElement.ID] = i;

                                                        breakNodeList = true;

                                                        break;
                                                    }
                                                }
                                                if (breakNodeList)
                                                    break;
                                            }

                                            //没有被拖入一任一个结点的docker
                                            if (!breakNodeList) {
                                                if (WFDOnActiveElement.StartNode) {
                                                    delete WFDNodeList[WFDOnActiveElement.StartNode.ID]["DockLineStart"][WFDOnActiveElement.ID];
                                                }

                                                //设置 当前线的开始粘附结点
                                                WFDLinkLineList[WFDOnActiveElement.ID].StartNode = null;
                                                //设置 当前线的开始附结点的Docker索引
                                                WFDLinkLineList[WFDOnActiveElement.ID].StartDockerIndex = null;

                                            }
                                        }


                                        if (event_DragCircle.data("PointIndex") == (thisLinePointList.length - 1)) {
                                            //结束点
                                            //查找最后一个点是否落在某一个docker中
                                            var LineEndX = thisLinePointList[thisLinePointList.length - 1][0];
                                            var LineEndY = thisLinePointList[thisLinePointList.length - 1][1];
                                            for (var thisNodeID in WFDNodeList) {
                                                var breakNodeList = false;
                                                for (var i = 0; i < 4; i++) {

                                                    if (Math.abs(WFDNodeList[thisNodeID].Dockers[i].rbox().cx - WFDrawer.rbox().addOffset().x - LineEndX) < WFD_DOCK_CIRCLE_R / 2
                                                        && Math.abs(WFDNodeList[thisNodeID].Dockers[i].rbox().cy - WFDrawer.rbox().addOffset().y - LineEndY) < WFD_DOCK_CIRCLE_R / 2
                                                    ) {
                                                        //落于当前Docker中
                                                        //如以前已经粘附在其它结点，首先需要脱离
                                                        if (WFDOnActiveElement.EndNode) {
                                                            delete WFDNodeList[WFDOnActiveElement.EndNode.ID]["DockLineEnd"][WFDOnActiveElement.ID];
                                                        }
                                                        //设置 当前线的结束粘附结点
                                                        WFDLinkLineList[WFDOnActiveElement.ID].EndNode = WFDNodeList[thisNodeID];
                                                        //设置 当前线的结束粘附结点的Docker索引
                                                        WFDLinkLineList[WFDOnActiveElement.ID].EndDockerIndex = i;
                                                        //设置 粘附着当前线的结点 的 结束点粘附线信息
                                                        WFDNodeList[thisNodeID]["DockLineEnd"][WFDOnActiveElement.ID] = i;

                                                        breakNodeList = true;

                                                        break;
                                                    }
                                                }
                                                if (breakNodeList)
                                                    break;
                                            }

                                            //没有被拖入一任一个结点的docker
                                            if (!breakNodeList) {
                                                if (WFDOnActiveElement.EndNode) {
                                                    delete WFDNodeList[WFDOnActiveElement.EndNode.ID]["DockLineEnd"][WFDOnActiveElement.ID];
                                                }

                                                //设置 当前线的结束粘附结点
                                                WFDLinkLineList[WFDOnActiveElement.ID].EndNode = null;
                                                //设置 当前线的结束附结点的Docker索引
                                                WFDLinkLineList[WFDOnActiveElement.ID].EndDockerIndex = null;

                                            }
                                        }

                                    });
                                    WFDOnActiveElement.DragCircle.push(thisDragCircle);
                                }

                                //查找最后一个点是否落在某一个docker中
                                var LineEndX = thisLinePointList[thisLinePointList.length - 1][0];
                                var LineEndY = thisLinePointList[thisLinePointList.length - 1][1];
                                for (var thisNodeID in WFDNodeList) {
                                    var breakNodeList = false;
                                    for (var i = 0; i < 4; i++) {

                                        if (Math.abs(WFDNodeList[thisNodeID].Dockers[i].rbox().cx - WFDrawer.rbox().addOffset().x - LineEndX) < WFD_DOCK_CIRCLE_R / 2
                                            && Math.abs(WFDNodeList[thisNodeID].Dockers[i].rbox().cy - WFDrawer.rbox().addOffset().y - LineEndY) < WFD_DOCK_CIRCLE_R / 2
                                        ) {
                                            //落于当前Docker中

                                            //设置 当前线的结束粘附结点
                                            WFDLinkLineList[WFDOnActiveElement.ID].EndNode = WFDNodeList[thisNodeID];
                                            //设置 当前线的结束粘附结点的Docker索引
                                            WFDLinkLineList[WFDOnActiveElement.ID].EndDockerIndex = i;
                                            //设置 粘附着当前线的结点 的 结束点粘附线信息
                                            WFDNodeList[thisNodeID]["DockLineEnd"][WFDOnActiveElement.ID] = i;

                                            breakNodeList = true;

                                            break;
                                        }
                                    }
                                    if (breakNodeList)
                                        break;
                                }



                                WFDOnActive = WFDOnActiveClass.None;
                                WFDOnActiveElement = null;
                                WFDLastClickRecord = null;

                            }
                        }
                        WFDLastClickRecord = thisClickRecord;
                    }
                }
                return;
            }


            //当在拖动线
            if (WFDOnActive == WFDOnActiveClass.ResizeLine) {

                //点击在SVG画布的空白处
                if (event.target.tagName && event.target.tagName == "svg") {

                    for (var i = 0; i < WFDOnActiveElement.DragCircle.length; i++) {
                        WFDOnActiveElement.DragCircle[i].hide();
                    }
                    WFDOnActive = WFDOnActiveClass.None;
                    WFDOnActiveElement = null;
                }

                //WFDOnActiveElement.DragNode
            }

            //当node被缩放中时发生了点击事件
            if (WFDOnActive == WFDOnActiveClass.ResizeNode) {
                //点击在SVG画布的空白处
                if (event.target.tagName && event.target.tagName == "svg") {
                    //取消选中 取消缩放
                    WFDOnActiveElement.Node.get(0).selectize(false).resize("stop");
                    WFDOnActiveElement = null;
                    WFDOnActive = WFDOnActiveClass.None;
                }
                return;
            }
        }

        //SVG上的双击事件
        function OnDBLClick(event) {
            //判断当前的点击
            if (WFDOnActive == WFDOnActiveClass.None) {
                //判断是否是在某个node上的点击

                for (var thisNode in WFDNodeList) {
                    if (IsSelfORChildElement(event.target.id, thisNode)) {
                        //判断是否是开始和结束节点
                        if (WFDNodeList[thisNode].NodeClass == WFDNodeClass.Begin || WFDNodeList[thisNode].NodeClass == WFDNodeClass.End) {
                            WFDNodeList[thisNode].Node.get(0).selectize();
                            WFDOnActive = WFDOnActiveClass.ResizeNode;
                            WFDOnActiveElement = WFDNodeList[thisNode];
                        } else {

                            WFDNodeList[thisNode].Node.get(0).selectize().resize().on("resizing", function (e) {
                                //在缩放过程中
                                for (var thisNode in WFDNodeList) {
                                    if (WFDNodeList[thisNode].Node.get(0).toString() == e.target.id) {
                                        var thisRect = SVG.get(e.target.id);
                                        var thisText = SVG.get(WFDNodeList[thisNode].Node.get(1).toString());
                                        thisText.center(thisRect.cx(), thisRect.cy());
                                        thisText.transform(thisRect.transform());
                                        var thisBackText = SVG.get(WFDNodeList[thisNode].Node.get(2).toString());
                                        thisBackText.move(thisRect.x() + 5, thisRect.y());
                                        thisBackText.transform(thisRect.transform());

                                        var thisDockerTop = SVG.get(WFDNodeList[thisNode].Dockers[0].toString());
                                        thisDockerTop.center(thisRect.cx(), thisRect.y());
                                        thisDockerTop.transform(thisRect.transform());
                                        var thisDockerRight = SVG.get(WFDNodeList[thisNode].Dockers[1].toString());
                                        thisDockerRight.center(thisRect.x() + thisRect.width(), thisRect.cy());
                                        thisDockerRight.transform(thisRect.transform());
                                        var thisDockerBottom = SVG.get(WFDNodeList[thisNode].Dockers[2].toString());
                                        thisDockerBottom.center(thisRect.cx(), thisRect.y() + thisRect.height());
                                        thisDockerBottom.transform(thisRect.transform());
                                        var thisDockerLeft = SVG.get(WFDNodeList[thisNode].Dockers[3].toString());
                                        thisDockerLeft.center(thisRect.x(), thisRect.cy());
                                        thisDockerLeft.transform(thisRect.transform());


                                        var thisDragNode = WFDNodeList[thisNode];

                                        for (var DockLineStartID in thisDragNode.DockLineStart) { // 遍历节点的所有 起始点粘附线
                                            if (typeof (thisDragNode.DockLineStart[DockLineStartID]) != "function") {
                                                // DockLineStart 为属性名称，thisDragNode.DockLineStart[DockLineStart]为对应属性的值
                                                var DragNodeDocker = thisDragNode.Dockers[thisDragNode.DockLineStart[DockLineStartID]];
                                                var thisLinePointList = WFDLinkLineList[DockLineStartID].Line.array().value;
                                                thisLinePointList[0] = [DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y];
                                                WFDLinkLineList[DockLineStartID].Line.plot(thisLinePointList);
                                                WFDLinkLineList[DockLineStartID].DragCircle[0].move(DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y);

                                            }
                                        }


                                        for (var DockLineEndID in thisDragNode.DockLineEnd) { // 遍历节点的所有 结束点粘附线
                                            if (typeof (thisDragNode.DockLineEnd[DockLineEndID]) != "function") {
                                                // DockLineEnd 为属性名称，thisDragNode.DockLineEnd[DockLineEnd]为对应属性的值
                                                var DragNodeDocker = thisDragNode.Dockers[thisDragNode.DockLineEnd[DockLineEndID]];
                                                var thisLinePointList = WFDLinkLineList[DockLineEndID].Line.array().value;
                                                thisLinePointList[thisLinePointList.length - 1] = [DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y];
                                                WFDLinkLineList[DockLineEndID].Line.plot(thisLinePointList);
                                                WFDLinkLineList[DockLineEndID].DragCircle[thisLinePointList.length - 1].move(DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y);

                                            }
                                        }


                                        break;

                                    }
                                }

                            }).on("resizedone", function (e) {
                                //在缩放结束后
                                for (var thisNode in WFDNodeList) {
                                    if (WFDNodeList[thisNode].Node.get(0).toString() == e.target.id) {
                                        var thisRect = SVG.get(e.target.id);
                                        var thisText = SVG.get(WFDNodeList[thisNode].Node.get(1).toString());
                                        thisText.center(thisRect.cx(), thisRect.cy());
                                        thisText.transform(thisRect.transform());
                                        var thisBackText = SVG.get(WFDNodeList[thisNode].Node.get(2).toString());
                                        thisBackText.move(thisRect.x() + 5, thisRect.y());
                                        thisBackText.transform(thisRect.transform());

                                        var thisDockerTop = SVG.get(WFDNodeList[thisNode].Dockers[0].toString());
                                        thisDockerTop.center(thisRect.cx(), thisRect.y());
                                        thisDockerTop.transform(thisRect.transform());
                                        var thisDockerRight = SVG.get(WFDNodeList[thisNode].Dockers[1].toString());
                                        thisDockerRight.center(thisRect.x() + thisRect.width(), thisRect.cy());
                                        thisDockerRight.transform(thisRect.transform());
                                        var thisDockerBottom = SVG.get(WFDNodeList[thisNode].Dockers[2].toString());
                                        thisDockerBottom.center(thisRect.cx(), thisRect.y() + thisRect.height());
                                        thisDockerBottom.transform(thisRect.transform());
                                        var thisDockerLeft = SVG.get(WFDNodeList[thisNode].Dockers[3].toString());
                                        thisDockerLeft.center(thisRect.x(), thisRect.cy());
                                        thisDockerLeft.transform(thisRect.transform());


                                        var thisDragNode = WFDNodeList[thisNode];

                                        for (var DockLineStartID in thisDragNode.DockLineStart) { // 遍历节点的所有 起始点粘附线
                                            if (typeof (thisDragNode.DockLineStart[DockLineStartID]) != " function ") {
                                                // DockLineStart 为属性名称，thisDragNode.DockLineStart[DockLineStart]为对应属性的值
                                                var DragNodeDocker = thisDragNode.Dockers[thisDragNode.DockLineStart[DockLineStartID]];
                                                var thisLinePointList = WFDLinkLineList[DockLineStartID].Line.array().value;
                                                thisLinePointList[0] = [DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y];
                                                WFDLinkLineList[DockLineStartID].Line.plot(thisLinePointList);
                                                WFDLinkLineList[DockLineStartID].DragCircle[0].move(DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y);

                                            }
                                        }


                                        for (var DockLineEndID in thisDragNode.DockLineEnd) { // 遍历节点的所有 结束点粘附线
                                            if (typeof (thisDragNode.DockLineEnd[DockLineEndID]) != "function") {
                                                // DockLineEnd 为属性名称，thisDragNode.DockLineEnd[DockLineEnd]为对应属性的值
                                                var DragNodeDocker = thisDragNode.Dockers[thisDragNode.DockLineEnd[DockLineEndID]];
                                                var thisLinePointList = WFDLinkLineList[DockLineEndID].Line.array().value;
                                                thisLinePointList[thisLinePointList.length - 1] = [DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y];
                                                WFDLinkLineList[DockLineEndID].Line.plot(thisLinePointList);
                                                WFDLinkLineList[DockLineEndID].DragCircle[thisLinePointList.length - 1].move(DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y);

                                            }
                                        }



                                        break;

                                    }
                                }
                            });
                            WFDOnActive = WFDOnActiveClass.ResizeNode;
                            WFDOnActiveElement = WFDNodeList[thisNode];
                        }
                    }
                       
                }

                //判断是否是在某个Line上的点击
                for (var thisLine in WFDLinkLineList) {
                    if (IsSelfORChildElement(event.target.id, thisLine)) {
                        for (var j = 0; j < WFDLinkLineList[thisLine].DragCircle.length; j++) {
                            WFDLinkLineList[thisLine].DragCircle[j].show();
                        }
                        WFDOnActive = WFDOnActiveClass.ResizeLine;
                        WFDOnActiveElement = WFDLinkLineList[thisLine];
                    }
                }

            }
        }

        //画结点
        function WFDDrawNode(NodeClass) {
            StopAll();
            if (NodeClass) {
                WFDOnActive = WFDOnActiveClass.DrawNode;
                var theNodeData = {
                    ID: null,//当前结点的group id
                    Node: null,//当前的结点的group 对象
                    Dockers: null,//当前结点的docker 数组
                    DockLineStart: {},//当前结点起始点粘附的线
                    DockLineEnd: {},//当前结点结束点粘附的线
                    Data: null//当前结点的附加数据
                };
                var thisNode = null, thisNodeBackShape = null, thisNodeContent = null, thisNodeBackText=null;
                var thisDockers = [];//上右下左
                if (!WFDSizeDrawer)
                    WFDSizeDrawer = WFDrawer.rect().stroke({ "color": "#333", "dasharray": [10, 5], "width": 2 }).fill({ color: '#aaa', opacity: 0.5 });
                WFDSizeDrawer.draw();
                WFDSizeDrawer.on('drawstart', function (e) {
                    WFDOnActive = WFDOnActiveClass.DrawingNode;
                });
                WFDSizeDrawer.on('drawstop', function (e) {
                    if (WFDOnActive == WFDOnActiveClass.None) {
                        return;
                    }
                    var SizeWidth = WFDSizeDrawer.width() < 100 ? 100 : WFDSizeDrawer.width();
                    var SizeHeigth = WFDSizeDrawer.height() < 30 ? 30 : WFDSizeDrawer.height();
                    switch (NodeClass) {

                        case WFDNodeClass.Begin: {
                            SizeWidth = WFD_BEGIN_END_NODE_R;
                            SizeHeigth = WFD_BEGIN_END_NODE_R;
                            thisNode = WFDrawerN.group().draggable();
                            thisNode.move(WFDSizeDrawer.x(), WFDSizeDrawer.y());
                            thisNodeBackShape = thisNode.circle(WFD_BEGIN_END_NODE_R).stroke({ color: "#090", width: 2 }).fill("#0f0");
                            break;

                        }
                        case WFDNodeClass.End: {
                            SizeWidth = WFD_BEGIN_END_NODE_R;
                            SizeHeigth = WFD_BEGIN_END_NODE_R;
                            thisNode = WFDrawerN.group().draggable();
                            thisNode.move(WFDSizeDrawer.x(), WFDSizeDrawer.y());
                            thisNodeBackShape = thisNode.circle(WFD_BEGIN_END_NODE_R).stroke({ color: "#000", width: 2 }).fill("#fff");
                            thisNodeContent = thisNode.circle(WFD_BEGIN_END_NODE_R - 10).stroke({ color: "#000", width: 2 }).fill("#900").center(SizeWidth / 2, SizeHeigth / 2);;
                            break;
                        }
                        case WFDNodeClass.Active: {
                            thisNode = WFDrawerN.group().draggable();
                            thisNode.move(WFDSizeDrawer.x(), WFDSizeDrawer.y());
                            thisNodeBackShape = thisNode.rect(SizeWidth, SizeHeigth).radius(15).stroke({ color: "#000", width: 2 }).fill("#eee");
                            thisNodeContent = thisNode.text("node1")
                                .fill("#00f")
                                .center(SizeWidth / 2, SizeHeigth / 2);
                            break;
                        }
                        case WFDNodeClass.Judge: {
                            SizeWidth = WFD_JUDGE_NODE_SIZE;
                            SizeHeigth = WFD_JUDGE_NODE_SIZE;
                            thisNode = WFDrawerN.group().draggable();
                            thisNode.move(WFDSizeDrawer.x(), WFDSizeDrawer.y());
                            var thisNodePath = ""
                                + "0," + SizeHeigth / 2 + " "
                                + SizeWidth / 2 + ",0 "
                                + SizeWidth + "," + SizeHeigth / 2 + " "
                                + SizeWidth / 2 + "," + SizeHeigth;
                            thisNodeBackShape = thisNode.polygon(thisNodePath).stroke({ color: "#000", width: 2 }).fill("#aaa");
                            thisNodeContent = thisNode.text("+")
                                .fill("#00f")
                                .center(SizeWidth / 2, SizeHeigth / 2);
                            break;
                        }
                        case WFDNodeClass.Children: {
                            thisNode = WFDrawerN.group().draggable();
                            thisNode.move(WFDSizeDrawer.x(), WFDSizeDrawer.y());
                            thisNodeBackShape = thisNode.rect(SizeWidth, SizeHeigth).radius(15).stroke({ color: "#000", width: 2 }).fill("#eee");
                            thisNodeContent = thisNode.text("node1")
                                .fill("#00f")
                                .center(SizeWidth / 2, SizeHeigth / 2);
                            thisNodeBackText = thisNode.text(" o-o")
                                .font({
                                    family: 'Arial',
                                    anchor: 'top',
                                    size: 20
                                }).move(5,0);
                            break;
                        }
                    }
                    if (thisNode) {
                        //当节点被拖动时line端点也随动
                        thisNode.on('dragmove.namespace', function (event) {
                            var thisDragNode = null;

                            thisDragNode = WFDNodeList[event.target.id];

                            for (var DockLineStartID in thisDragNode.DockLineStart) { // 遍历节点的所有 起始点粘附线
                                if (typeof (thisDragNode.DockLineStart[DockLineStartID]) != "function") {
                                    // DockLineStartID 为属性名称，thisDragNode.DockLineStart[DockLineStartID]为对应属性的值
                                    var DragNodeDocker = thisDragNode.Dockers[thisDragNode.DockLineStart[DockLineStartID]];
                                    var thisLinePointList = WFDLinkLineList[DockLineStartID].Line.array().value;
                                    thisLinePointList[0] = [DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y];
                                    WFDLinkLineList[DockLineStartID].Line.plot(thisLinePointList);
                                    WFDLinkLineList[DockLineStartID].DragCircle[0].move(DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x - WFD_DRAG_CIRCLE_R / 2, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y - WFD_DRAG_CIRCLE_R / 2);

                                }
                            }


                            for (var DockLineEndID in thisDragNode.DockLineEnd) { // 遍历节点的所有 结束点粘附线
                                if (typeof (thisDragNode.DockLineEnd[DockLineEndID]) != "function") {
                                    // DockLineEndID 为属性名称，thisDragNode.DockLineEnd[DockLineEndID]为对应属性的值
                                    var DragNodeDocker = thisDragNode.Dockers[thisDragNode.DockLineEnd[DockLineEndID]];
                                    var thisLinePointList = WFDLinkLineList[DockLineEndID].Line.array().value;
                                    thisLinePointList[thisLinePointList.length - 1] = [DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y];
                                    WFDLinkLineList[DockLineEndID].Line.plot(thisLinePointList);
                                    WFDLinkLineList[DockLineEndID].DragCircle[thisLinePointList.length - 1].move(DragNodeDocker.rbox().cx - WFDrawer.rbox().addOffset().x - WFD_DRAG_CIRCLE_R / 2, DragNodeDocker.rbox().cy - WFDrawer.rbox().addOffset().y - WFD_DRAG_CIRCLE_R / 2);
                                }
                            }
                        });

                        //上右下左
                        var DockerTop = thisNode.circle(WFD_DOCK_CIRCLE_R)
                            .stroke({ color: "black", width: 1 })
                            .fill("#fff")
                            .center(SizeWidth / 2, 0)
                            .click(OnClickDocker);
                        thisDockers.push(DockerTop);

                        WFDNodeDockerList[DockerTop.node.id] = {
                            NodeID: thisNode.node.id,
                            DockerIndex: 0
                        };

                        var DockerRight = thisNode.circle(WFD_DOCK_CIRCLE_R)
                            .stroke({ color: "black", width: 1 })
                            .fill("#fff")
                            .center(SizeWidth, SizeHeigth / 2)
                            .click(OnClickDocker);
                        thisDockers.push(DockerRight);

                        WFDNodeDockerList[DockerRight.node.id] = {
                            NodeID: thisNode.node.id,
                            DockerIndex: 1
                        };

                        var DockerBottom = thisNode.circle(WFD_DOCK_CIRCLE_R)
                            .stroke({ color: "black", width: 1 })
                            .fill("#fff")
                            .center(SizeWidth / 2, SizeHeigth)
                            .click(OnClickDocker);
                        thisDockers.push(DockerBottom);

                        WFDNodeDockerList[DockerBottom.node.id] = {
                            NodeID: thisNode.node.id,
                            DockerIndex: 2
                        };

                        var DockerLeft = thisNode.circle(WFD_DOCK_CIRCLE_R)
                            .stroke({ color: "black", width: 1 })
                            .fill("#fff")
                            .center(0, SizeHeigth / 2)
                            .click(OnClickDocker);
                        thisDockers.push(DockerLeft);

                        WFDNodeDockerList[DockerLeft.node.id] = {
                            NodeID: thisNode.node.id,
                            DockerIndex: 3
                        };


                        theNodeData.ID = thisNode.node.id;
                        theNodeData.Node = thisNode;
                        theNodeData.NodeClass = NodeClass;
                        theNodeData.Dockers = thisDockers;


                        WFDNodeList[theNodeData.ID] = theNodeData;
                    }
                    WFDSizeDrawer.remove();
                    WFDSizeDrawer = null;
                    WFDOnActive = WFDOnActiveClass.None;
                });
            }
        }

        //删除结点
        function WFDRemoveNode(nodeid) {
            //是否有当前被选中的点
            if (WFDOnActive == WFDOnActiveClass.ResizeNode) {
                //找到所有粘附在点上的线 解除粘附
                var thisNode = WFDNodeList[WFDOnActiveElement.ID];
                StopAll();

                for (var thisLineID in thisNode.DockLineStart) {
                    //删除线上的起始节点
                    WFDLinkLineList[thisLineID].StartNode = null;
                    WFDLinkLineList[thisLineID].StartNodeIndex = null;
                }
                for (var thisLineID in thisNode.DockLineEnd) {
                    //删除线上的结束节点
                    WFDLinkLineList[thisLineID].EndNode = null;
                    WFDLinkLineList[thisLineID].EndNodeIndex = null;
                }
                //删除节点的所有Docker的记录
                for (var i = 0; i < thisNode.Dockers.length; i++) {
                    delete WFDNodeDockerList[thisNode.Dockers[i].node.id];
                }
                
                //删除结点
                thisNode.Node.remove();
                delete WFDNodeList[thisNode.id];

                //跟踪结果
                WFDrawer.each(function (i, children) {
                    children;
                })
            }
        }

        //画线
        function WFDDrawLine() {
            StopAll();
            var thisLinkLine = {
                ID: null,
                Line: null,
                StartNode: null,
                StartDockerIndex: null,
                EndNode: null,
                EndDockerIndex: null,
                DragCircle: []
            };

            thisLinkLine.Line = WFDrawerL.polyline();
            thisLinkLine.ID = thisLinkLine.Line.node.id;
            thisLinkLine.Line.fill("none");
            thisLinkLine.Line.stroke({
                width: 2,
                color: 'red'
            });

            WFDOnActive = WFDOnActiveClass.DrawLine;
            WFDOnActiveElement = thisLinkLine;

            thisLinkLine.Line.draw();

            WFDLinkLineList[thisLinkLine.ID] = thisLinkLine;

        }

        //删除线
        function WFDRemoveLine(lineid) {

            //是否有当前被选中的线
            if (WFDOnActive == WFDOnActiveClass.ResizeLine) {
                //找到所有粘附在线上的点 解除粘附
                var thisLine = WFDLinkLineList[WFDOnActiveElement.ID];
                StopAll();

                //线上的所有拖动点
                thisLine.DragCircle;
                for (var i = 0; i < thisLine.DragCircle.length; i++) {
                    thisLine.DragCircle[i].remove();
                }
                //线的开始结点
                if (thisLine.EndNode) {
                    delete WFDNodeList[thisLine.EndNode.ID]["DockLineEnd"][thisLine.ID];
                }
                //线的结束结点
                if (thisLine.StartNode) {
                    delete WFDNodeList[thisLine.StartNode.ID]["DockLineStart"][thisLine.ID];
                }
                //删除线
                thisLine.Line.remove();
                delete WFDLinkLineList[thisLine.ID];

                //跟踪结果
                WFDrawer.each(function (i, children) {
                    children;
                })
            }
        }

        if (SVG.supported) {
            WFDrawer = new SVG(domID).size("100%", "100%");
            WFDrawerL = WFDrawer.group();
            WFDrawerN = WFDrawer.group();
            WFDrawerLDrag = WFDrawer.group();
            WFDrawer.on("click", OnClick);
            WFDrawer.on("dblclick", OnDBLClick);


            //数据准备
            if (!IsIE()) {
                //IE不支持marker需要判断如果是IE就不要加这个
                WFDLinkLineMarkerModel.marker_s = WFDrawer.marker(7, 7, function (add) {
                    add.circle(7).fill("#f06");
                });
                WFDLinkLineMarkerModel.marker_e = WFDrawer.marker(28, 7, function (add) {
                    add.polygon("6,0 16,3 16,4 6,7").fill("#0f9");
                });
            }

            //外部函数 扩大编辑区 
            this.SetSVGSize = function (width,height) {
                $("#" + domID).width(width).height(height);
            }
            this.AddNode = function (NodeClass) {
                return WFDDrawNode(NodeClass);
            }
            this.AddLine = function () {
                return WFDDrawLine();
            }

            this.RemoveObj = function () {
                WFDRemoveNode();
                WFDRemoveLine();
            }
            this.RemoveNode = function () {
                return WFDRemoveNode();
            }
            this.RemoveLine = function () {
                return WFDRemoveLine();
            }
            return this;
        } else {
            return null;
        }
    }
}).call(this);







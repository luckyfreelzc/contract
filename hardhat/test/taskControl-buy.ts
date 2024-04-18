import {
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre from "hardhat";
import {deployMyToken} from "../scripts/MyToken-deploy"

import { deployRedEnvelope } from "../scripts/LuckyRedEnvelopeV2-deploy";
import { deployTaskControl } from "../scripts/TaskControl-deploy";
import { deployEmptyTask } from "../scripts/EmptyTask-deploy";
import { expect } from "chai";


describe("task control", function (){
    let myToken;
    let luckyRedEnvelope;
    let taskControl;
    let owner;
    let otherAccount;
    before(async function(){
        //初始化合约
        myToken = await loadFixture(deployMyToken);
        const addr1 = await myToken.getAddress();
        console.log('myToken address:',addr1);

        luckyRedEnvelope = await loadFixture(deployRedEnvelope);
        const addr2 = await luckyRedEnvelope.getAddress();
        console.log('redEnvelope address:',addr2);

        [owner,otherAccount] = await hre.ethers.getSigners();

        taskControl = await loadFixture(deployTaskControl)
        
    });
    describe("do task",function(){
        let emptyTask;
        before(async function(){
            //部署具体领取任务：emptyTask：任意地址执行即可以免费领取投注
            emptyTask = await loadFixture(deployEmptyTask);
            const emptyTaskAddr = await emptyTask.getAddress();
            console.log('emptyTask address:',emptyTaskAddr);
            
            //绑定emptyTask到taskControl，设置权重为10**decimals
            const weight = await taskControl.decimals();
            const setTask = taskControl.setTask(emptyTaskAddr,Math.pow(10,Number(weight)) );
            await expect(setTask).not.to.be.reverted;
            await (await setTask).wait();     
            
        });
        it("get task token", async function () {
            //完成emptyTask任务领取10个投注token
            const emptyTaskAddr = await emptyTask.getAddress();
            const mintToken = taskControl.mintToken(emptyTaskAddr,otherAccount,10n,'0x');
            await expect(mintToken).not.to.be.reverted;
            const recept = await (await mintToken).wait();
            
            const balance = await taskControl.balanceOf(otherAccount);
            console.log('get token tx:%s otherAccount token balance:%d',recept.hash,balance);
        });

    });
    describe("redEnvelope",function(){
        let id;
        before(async function(){
            //授权用户地址向红包合约转账
            const luckyRedEnvelopeAddr = await luckyRedEnvelope.getAddress();
            const approveCall = myToken.approve(luckyRedEnvelopeAddr,1000000000);
            await expect(approveCall).not.to.be.reverted;
            await (await approveCall).wait() ;

            //给taskControl打点U
            const taskControlAddr = await taskControl.getAddress();
            const transferCall = myToken.transfer(taskControlAddr,1000000000);
            await expect(transferCall).not.to.be.reverted;

            await (await transferCall).wait();

            //创建buy模式红包
            const createRedEnvelopeCall = luckyRedEnvelope.createRedEnvelope(0n,0n,20n,0n);
            await expect(createRedEnvelopeCall).not.to.be.reverted;
            
            await (await createRedEnvelopeCall).wait();

            id = await luckyRedEnvelope.viewCurrentRedEnvelopeId();
            const balance = await myToken.balanceOf(owner);
            console.log('id:%d owner balance:%d',id,balance);
        });
        
        it("inject", async function () {    
            //owner捐赠10注
            const injectTickets = luckyRedEnvelope.injectTickets(id,10n);
            await expect(injectTickets).not.to.be.reverted;
            const recept = await (await injectTickets).wait();
            
            const balance = await myToken.balanceOf(owner);
            console.log('id:%d inject tx:%s balance:%d',id,recept.hash,balance);
        });
        it("owner getTicket",async function () {
            //owner通过taskControl代买5注
            let balance = await taskControl.balanceOf(owner);
            console.log('owner token before balance:%d',balance);

            //owner 尝试消耗5token领取5投注，由于token不足执行失败
            const getTicket =  taskControl.getTicket(id,owner,5n);
            
            await expect(getTicket).to.be.reverted;
            //const recept = await (await getTicket).wait();

            //balance = await taskControl.balanceOf(owner);
            //console.log('owner token after balance:%d',recept.hash,balance);
        });

        it("otherAccount getTicket",async function () {
            //otherAccount通过taskControl代买5注
            let balance = await taskControl.balanceOf(otherAccount);
            console.log('otherAccount token before balance:%d',balance);
            
            //otherAccount 尝试消耗5token领取5投注
            //由于为buy模式，因此taskControl将会向luckyRedEnvelope购买5投注，并赠送给otherAccount
            const getTicket =  taskControl.connect(otherAccount).getTicket(id,otherAccount,5n);
            
            await expect(getTicket).not.to.be.reverted;
            const recept = await (await getTicket).wait();

            balance = await taskControl.balanceOf(otherAccount);
            console.log('otherAccount token after balance:%d',balance);
        });

    });
    
    
    describe("end redEnvelope",function(){
        it("end", async function (){
            //结束投注
            const id = await luckyRedEnvelope.viewCurrentRedEnvelopeId();
            const endRedEnvelope = luckyRedEnvelope.endRedEnvelope(id);

            await expect(endRedEnvelope).not.to.be.reverted;
            const recept = await (await endRedEnvelope).wait();

            const balance = await myToken.balanceOf(otherAccount)
            
            console.log('id:%d end tx:%s otherAccount balance:%d',id,recept.hash,balance);
        });
    });
    describe("drawPrize redEnvelope",function(){
        //开奖
        it("drawPrize", async function () {
            const id = await luckyRedEnvelope.viewCurrentRedEnvelopeId();
            const drawPrize = luckyRedEnvelope.drawPrize(id,0n);
            await expect(drawPrize).not.to.be.reverted;
            const recept = await (await drawPrize).wait();   
            
            //owner捐赠10注 + taskControl购买5注，otherAccount最终获得15注的中奖
            const balance = await myToken.balanceOf(otherAccount)
            
            console.log('id:%d drawPrize tx:%s otherAccount balance:%d',id,recept.hash,balance);
        });
    });
});
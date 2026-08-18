"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

const DEFAULT_YEAR=2026;
const ReportingYearContext=createContext({year:DEFAULT_YEAR,setYear:(_year:number)=>{}});

export function ReportingYearProvider({children}:{children:ReactNode}){
  const [year,setYear]=useState(DEFAULT_YEAR);
  useEffect(()=>{const saved=Number(localStorage.getItem("dcs_reporting_year"));if(saved>=2020&&saved<=2100)setYear(saved)},[]);
  const update=(next:number)=>{setYear(next);localStorage.setItem("dcs_reporting_year",String(next))};
  return <ReportingYearContext.Provider value={{year,setYear:update}}>{children}</ReportingYearContext.Provider>;
}

export function useReportingYear(){return useContext(ReportingYearContext)}
export function yearRange(year:number){return {start:`${year}-01-01`,end:`${year}-12-31`}}

export function ReportingYearPicker(){
  const {year,setYear}=useReportingYear();
  return <label className="year-picker"><span>Año</span><select value={year} onChange={event=>setYear(Number(event.target.value))}>{[2026,2025,2024,2023].map(value=><option key={value}>{value}</option>)}</select></label>;
}

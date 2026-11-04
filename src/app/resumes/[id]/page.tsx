"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ResumeEditor } from "@/components/ResumeEditor";
import { defaultResumeData } from "@/lib/resume.utils";
import type { ResumeData } from "@/lib/resume.types";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function EditResumePage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [data, setData] = useState<ResumeData>(defaultResumeData());
  const [title, setTitle] = useState("My Resume");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/resumes/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((resume) => {
        setData((resume.content as ResumeData) || defaultResumeData());
        setTitle(resume.title || "My Resume");
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <p className="font-serif-calm text-3xl">Resume not found.</p>
          <Link href="/resumes" className="calm-pill inline-block mt-6">
            Back to resumes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#FAFAF7] text-[#111]">
      <ResumeEditor resumeId={id} initialData={data} initialTitle={title} />
    </div>
  );
}

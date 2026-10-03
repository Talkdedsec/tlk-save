//! Killing a whole process tree, not just its root.
//!
//! The standalone yt-dlp executable is a launcher that starts the real
//! process as its child, and that child starts ffmpeg. Killing only the
//! launcher leaves the download running until its output pipe breaks. On
//! Windows every process goes into a job object that dies with its handle; on
//! Unix the tree gets its own process group.

use tokio::process::{Child, Command};

pub struct Tree {
    #[cfg(windows)]
    job: windows::Job,
    #[cfg(unix)]
    pgid: Option<i32>,
}

/// Call before spawning.
pub fn prepare(cmd: &mut Command) {
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(not(unix))]
    let _ = cmd;
}

impl Tree {
    /// Call right after spawning.
    pub fn attach(child: &Child) -> Self {
        #[cfg(windows)]
        {
            let job = windows::Job::new();
            if let (Some(job), Some(handle)) = (&job, child.raw_handle()) {
                job.assign(handle);
            }
            Self {
                job: job.unwrap_or_default(),
            }
        }
        #[cfg(unix)]
        {
            Self {
                pgid: child.id().and_then(|id| i32::try_from(id).ok()),
            }
        }
    }

    pub fn kill(&self) {
        #[cfg(windows)]
        self.job.terminate();
        #[cfg(unix)]
        if let Some(pgid) = self.pgid {
            // SAFETY: plain syscall; a stale group id only makes it fail.
            unsafe { libc::kill(-pgid, libc::SIGKILL) };
        }
    }
}

#[cfg(windows)]
mod windows {
    use std::{ffi::c_void, mem::size_of, ptr::null};

    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject,
        },
    };

    /// A job object with kill-on-close: dropping it ends every process in it.
    #[derive(Default)]
    pub struct Job(Option<isize>);

    // The handle is only a kernel object reference; it is safe to move between threads.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        pub fn new() -> Option<Self> {
            // SAFETY: documented Win32 calls with valid arguments; the handle
            // is checked before use and closed in Drop.
            unsafe {
                let handle = CreateJobObjectW(null(), null());
                if handle.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    (&raw const info).cast::<c_void>(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                Some(Self(Some(handle as isize)))
            }
        }

        fn handle(&self) -> Option<HANDLE> {
            self.0.map(|h| h as HANDLE)
        }

        pub fn assign(&self, process: std::os::windows::io::RawHandle) {
            if let Some(job) = self.handle() {
                // SAFETY: both handles are live; failure leaves the process unassigned.
                unsafe { AssignProcessToJobObject(job, process as HANDLE) };
            }
        }

        pub fn terminate(&self) {
            if let Some(job) = self.handle() {
                // SAFETY: the handle is live until Drop.
                unsafe { TerminateJobObject(job, 1) };
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            if let Some(job) = self.handle() {
                // SAFETY: closed exactly once.
                unsafe { CloseHandle(job) };
            }
        }
    }
}
